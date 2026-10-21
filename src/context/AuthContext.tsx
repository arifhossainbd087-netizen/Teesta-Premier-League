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
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { UserRole, Team } from '../types';

export const BOOTSTRAP_ADMIN_EMAIL = 'arifhossainbd087@gmail.com';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userRole: UserRole;
  isAdmin: boolean;
  activeTeam: Team | null;
  allTeams: Team[];
  isAuthLoading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  setTestSimulatedRole: (role: UserRole, team?: Team | null) => void;
  isSimulated: boolean;
  language: 'bn' | 'en';
  setLanguage: (lang: 'bn' | 'en') => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userRole, setUserRole] = useState<UserRole>('viewer');
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSimulated, setIsSimulated] = useState(false);
  const [language, setLanguage] = useState<'bn' | 'en'>('bn');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      setCurrentUser(user);
      if (user) {
        const email = user.email?.toLowerCase() || '';
        // Check Admin privilege
        if (email === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
          setUserRole('admin');
        } else {
          // Check if admin document exists in Firestore
          try {
            const adminDoc = await getDoc(doc(db, 'admins', user.uid));
            if (adminDoc.exists()) {
              setUserRole('admin');
            } else {
              // Check user profile role
              const userDoc = await getDoc(doc(db, 'users', user.uid));
              if (userDoc.exists() && userDoc.data().role === 'admin') {
                setUserRole('admin');
              } else if (userDoc.exists() && userDoc.data().role === 'team') {
                setUserRole('team');
              } else {
                setUserRole('viewer');
              }
            }
          } catch (e) {
            console.error('Error verifying admin rights:', e);
            setUserRole('viewer');
          }
        }
      } else {
        // If not logged in and not simulated, default to viewer
        if (!isSimulated) {
          setUserRole('viewer');
          setActiveTeam(null);
        }
      }
      setIsAuthLoading(false);
    });

    return () => unsubscribe();
  }, [isSimulated]);

  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      setIsSimulated(false);
      if (cred.user) {
        const isAdmin = cred.user.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
        // Set user profile
        await setDoc(
          doc(db, 'users', cred.user.uid),
          {
            email: cred.user.email,
            displayName: cred.user.displayName || 'TPL User',
            role: isAdmin ? 'admin' : 'viewer',
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
        // If master admin, also create /admins doc
        if (isAdmin) {
          try {
            await setDoc(
              doc(db, 'admins', cred.user.uid),
              {
                email: cred.user.email,
                role: 'admin',
                createdAt: new Date().toISOString(),
              },
              { merge: true }
            );
          } catch (e) {
            console.error('Error recording admin entry:', e);
          }
        }
      }
    } catch (err) {
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
    const isAdmin = email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
    await setDoc(
      doc(db, 'users', cred.user.uid),
      {
        email,
        displayName: email.split('@')[0],
        role: isAdmin ? 'admin' : 'viewer',
        createdAt: new Date().toISOString(),
      },
      { merge: true }
    );
  };

  const logout = async () => {
    await fbSignOut(auth);
    setIsSimulated(false);
    setActiveTeam(null);
    setUserRole('viewer');
  };

  const setTestSimulatedRole = (role: UserRole, team?: Team | null) => {
    setIsSimulated(true);
    setUserRole(role);
    if (role === 'team' && team) {
      setActiveTeam(team);
    } else {
      setActiveTeam(null);
    }
  };

  const isAdmin = userRole === 'admin';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userRole,
        isAdmin,
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
