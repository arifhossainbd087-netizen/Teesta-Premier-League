import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as fbSignOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs, onSnapshot } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType, isQuotaExceededError } from '../firebase/config';
import { UserRole, Team } from '../types';

export const BOOTSTRAP_ADMIN_EMAIL = 'arifhossainbd087@gmail.com';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userRole: UserRole;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isPrimaryAdmin: boolean;
  adminRole: 'primary' | 'assistant' | 'none';
  verifiedAdminRole: 'primary' | 'assistant' | 'none';
  activeTeam: Team | null;
  allTeams: Team[];
  isAuthLoading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  setTestSimulatedRole: (role: UserRole, team?: Team | null, isSimPrimary?: boolean) => void;
  isSimulated: boolean;
  language: 'bn' | 'en';
  setLanguage: (lang: 'bn' | 'en') => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userRole, setUserRole] = useState<UserRole>('viewer');
  const [isPrimaryAdmin, setIsPrimaryAdmin] = useState<boolean>(false);
  const [adminRole, setAdminRole] = useState<'primary' | 'assistant' | 'none'>('none');
  const [verifiedAdminRole, setVerifiedAdminRole] = useState<'primary' | 'assistant' | 'none'>('none');
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSimulated, setIsSimulated] = useState(false);
  const [language, setLanguage] = useState<'bn' | 'en'>('bn');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      setCurrentUser(user);
      if (user) {
        const email = (user.email || '').trim().toLowerCase();
        
        // 1. Check if user is the permanent Primary Super Admin
        if (email === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
          setUserRole('admin');
          setIsPrimaryAdmin(true);
          setAdminRole('primary');
          setVerifiedAdminRole('primary');
        } else {
          // 2. Check Firestore /admins collection by email (and fallback by UID)
          try {
            let authorizedAsAdmin = false;
            
            // Check by exact email doc
            if (email) {
              const adminEmailDoc = await getDoc(doc(db, 'admins', email));
              if (adminEmailDoc.exists()) {
                const data = adminEmailDoc.data();
                if (data.status === 'active') {
                  authorizedAsAdmin = true;
                }
              }
            }

            // Fallback check by UID doc
            if (!authorizedAsAdmin) {
              const adminUidDoc = await getDoc(doc(db, 'admins', user.uid));
              if (adminUidDoc.exists()) {
                const data = adminUidDoc.data();
                if (data.status === 'active') {
                  authorizedAsAdmin = true;
                }
              }
            }

            if (authorizedAsAdmin) {
              setUserRole('admin');
              setIsPrimaryAdmin(false);
              setAdminRole('assistant');
              setVerifiedAdminRole('assistant');
            } else {
              // 3. User is not an admin, check if user's Gmail is assigned to any team
              setIsPrimaryAdmin(false);
              setAdminRole('none');
              setVerifiedAdminRole('none');

              // Check existing in-memory/cached teams without making a full collection getDocs read
              let matchedTeam: Team | null = null;
              try {
                const cachedTeamsStr = localStorage.getItem('tpl_cached_teams');
                const candidateTeams: Team[] = allTeams.length > 0 ? allTeams : cachedTeamsStr ? JSON.parse(cachedTeamsStr) : [];
                matchedTeam = candidateTeams.find(t => {
                  const assigned = (t.loginEmail || t.userEmail || '').trim().toLowerCase();
                  return assigned && assigned === email;
                }) || null;
              } catch (err) {
                console.warn('Notice matching team from cache:', err);
              }

              if (matchedTeam) {
                setUserRole('team');
                setActiveTeam(matchedTeam);
              } else {
                setUserRole('viewer');
                setActiveTeam(null);
              }
            }
          } catch (e) {
            console.error('Error verifying user authorization:', e);
            setUserRole('viewer');
            setActiveTeam(null);
            setIsPrimaryAdmin(false);
            setAdminRole('none');
            setVerifiedAdminRole('none');
          }
        }
      } else {
        // If not logged in, strictly enforce viewer role and clear all privileges
        setCurrentUser(null);
        setUserRole('viewer');
        setIsPrimaryAdmin(false);
        setAdminRole('none');
        setVerifiedAdminRole('none');
        setActiveTeam(null);
        setIsSimulated(false);
      }
      setIsAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Real-time synchronization of allTeams (Attached once with [] deps to prevent listener churn)
  useEffect(() => {
    const unsubTeams = onSnapshot(
      collection(db, 'teams'),
      snap => {
        const list: Team[] = [];
        snap.forEach(docSnap => {
          list.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        setAllTeams(list);
        try {
          localStorage.setItem('tpl_cached_teams', JSON.stringify(list));
        } catch {}
      },
      error => {
        if (isQuotaExceededError(error)) {
          try {
            const cached = localStorage.getItem('tpl_cached_teams');
            if (cached) {
              setAllTeams(JSON.parse(cached));
            }
          } catch {}
        }
        handleFirestoreError(error, OperationType.GET, 'teams');
      }
    );

    return () => unsubTeams();
  }, []);

  // In-memory team matching (Pure reactive calculation - 0 Firestore reads)
  useEffect(() => {
    if (currentUser && !isSimulated) {
      const email = (currentUser.email || '').trim().toLowerCase();
      const isMaster = email === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
      if (!isMaster && adminRole === 'none') {
        const matched = allTeams.find(t => {
          const assigned = (t.loginEmail || t.userEmail || '').trim().toLowerCase();
          return assigned && assigned === email;
        });
        if (matched) {
          setActiveTeam(matched);
          setUserRole('team');
        } else {
          setActiveTeam(null);
          setUserRole('viewer');
        }
      }
    }
  }, [allTeams, currentUser, isSimulated, adminRole]);

  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      setIsSimulated(false);
      if (cred.user) {
        const email = (cred.user.email || '').trim().toLowerCase();
        const isMaster = email === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();

        // Check if user is pre-authorized in admins collection
        let isAdditionalAdmin = false;
        try {
          const adminDoc = await getDoc(doc(db, 'admins', email));
          if (adminDoc.exists() && adminDoc.data()?.status === 'active') {
            isAdditionalAdmin = true;
          }
        } catch (err) {
          console.warn('Error reading admin authorization on login:', err);
        }

        // Check if user is pre-assigned to a team from in-memory allTeams (0 additional reads)
        const isTeamManager = allTeams.some(t => {
          const assigned = (t.loginEmail || t.userEmail || '').trim().toLowerCase();
          return assigned && assigned === email;
        });

        const effectiveRole = isMaster || isAdditionalAdmin ? 'admin' : isTeamManager ? 'team' : 'viewer';

        // Set or update user profile with strictly authorized role
        await setDoc(
          doc(db, 'users', cred.user.uid),
          {
            email: cred.user.email,
            displayName: cred.user.displayName || 'TPL User',
            role: effectiveRole,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );

        // If master admin, also ensure /admins/arifhossainbd087@gmail.com doc exists
        if (isMaster) {
          try {
            await setDoc(
              doc(db, 'admins', email),
              {
                email,
                role: 'primary',
                status: 'active',
                addedBy: 'system',
                displayName: cred.user.displayName || 'Primary Admin',
                createdAt: new Date().toISOString(),
              },
              { merge: true }
            );
          } catch (e) {
            console.error('Error recording admin entry:', e);
          }
        }
      }
    } catch (err: any) {
      const code = err?.code || '';
      const message = err?.message || '';

      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request' ||
        message.includes('popup-closed-by-user')
      ) {
        console.info('Google sign-in popup dismissed by user.');
        throw err;
      }

      if (
        code === 'auth/network-request-failed' ||
        code === 'auth/popup-blocked' ||
        message.includes('network-request-failed')
      ) {
        console.warn('Google sign-in popup network or origin validation blocked in sandbox environment:', code);
        throw err;
      }

      console.error('Google Sign In Error:', err);
      throw err;
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
    setIsSimulated(false);
  };

  const registerWithEmail = async (email: string, pass: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    setIsSimulated(false);
    const emailNorm = email.trim().toLowerCase();
    const isMaster = emailNorm === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
    
    // Regular registration cannot self-grant admin
    await setDoc(
      doc(db, 'users', cred.user.uid),
      {
        email,
        displayName: email.split('@')[0],
        role: isMaster ? 'admin' : 'viewer',
        createdAt: new Date().toISOString(),
      },
      { merge: true }
    );
  };

  const logout = async () => {
    try {
      await fbSignOut(auth);
    } catch (err) {
      console.error('Logout error:', err);
    }
    setCurrentUser(null);
    setIsSimulated(false);
    setActiveTeam(null);
    setUserRole('viewer');
    setIsPrimaryAdmin(false);
    setAdminRole('none');
    setVerifiedAdminRole('none');
  };

  const setTestSimulatedRole = (role: UserRole, team?: Team | null, isSimPrimary?: boolean) => {
    // Only verified administrators can switch role views (e.g. previewing team perspective)
    const isVerifiedAdmin =
      currentUser &&
      (verifiedAdminRole === 'primary' ||
        verifiedAdminRole === 'assistant' ||
        (currentUser.email || '').trim().toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase());

    if (!isVerifiedAdmin) {
      console.warn('Unauthorized role switch attempt blocked: Only verified admins can switch perspective.');
      return;
    }

    if (role === 'admin') {
      setIsSimulated(false);
      setUserRole('admin');
      const isPrimary = verifiedAdminRole === 'primary' || (isSimPrimary ?? true);
      setIsPrimaryAdmin(isPrimary);
      setAdminRole(isPrimary ? 'primary' : 'assistant');
      setActiveTeam(null);
    } else if (role === 'team') {
      setIsSimulated(true);
      setUserRole('team');
      // Keep verifiedAdminRole intact so admin can switch back at any time
      setIsPrimaryAdmin(false);
      setAdminRole('none');
      setActiveTeam(team || null);
    } else {
      // viewer (public view)
      setIsSimulated(true);
      setUserRole('viewer');
      // Keep verifiedAdminRole intact so admin can switch back at any time
      setIsPrimaryAdmin(false);
      setAdminRole('none');
      setActiveTeam(null);
    }
  };

  // Strictly enforce that isAdmin requires an authenticated user with verified credentials
  const isAdmin =
    userRole === 'admin' &&
    !!currentUser &&
    (verifiedAdminRole === 'primary' ||
      verifiedAdminRole === 'assistant' ||
      (currentUser.email || '').trim().toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase());

  // isSuperAdmin specifically designates the permanent platform primary admin
  const isSuperAdmin =
    isAdmin &&
    (verifiedAdminRole === 'primary' ||
      (currentUser?.email || '').trim().toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase());

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userRole,
        isAdmin,
        isSuperAdmin,
        isPrimaryAdmin,
        adminRole,
        verifiedAdminRole,
        activeTeam,
        allTeams,
        isAuthLoading,
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        logout,
        setTestSimulatedRole,
        isSimulated,
        language,
        setLanguage,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};


export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
