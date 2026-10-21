# Security Specification: Teesta Premier League Season 2 (TPL S2)

## 1. Data Invariants
1. **Public Auction Visibility**: Anyone (including unauthenticated viewers in stadium/live stream) can read `/auction/current`, active player info, teams list, and confirmed bids so the auction projector/live broadcast works seamlessly.
2. **Admin Privileges**: Only verified administrators (`arifhossainbd087@gmail.com` or users present in `/admins/{uid}`) can change auction state, mark players SOLD/UNSOLD, approve player registrations, modify budgets, or edit league settings.
3. **Team Bidding Autonomy & Integrity**: An authenticated team manager can only place bids on behalf of their assigned team. They cannot forge another team's ID or bid without being assigned to that team in `/users/{userId}` or `/teams/{teamId}`.
4. **Budget Safeguard**: Bids cannot exceed a team's remaining purse (`remainingBudget`).
5. **Bid Increment & State Integrity**: Every new bid must be strictly greater than the current bid plus minimum increment, and auction status must be `active`.
6. **Audit Trails**: Audit logs are append-only. No user can modify or delete existing audit entries.
7. **PII Protection**: Player phone numbers and payment transaction IDs are accessible to league administrators and the player's own record.

---

## 2. The "Dirty Dozen" Threat Payloads

1. **Rogue Bidder (Identity Spoofing)**: Attacker attempts to place a bid under `team_alpha` using credentials of `team_beta`.
   * *Expected*: REJECTED by `request.auth.uid == team.userId` or user-role binding.
2. **Negative / Zero Bid Step**: Attacker bids ৳100 when current bid is ৳50,000 and increment is ৳1,000.
   * *Expected*: REJECTED by transaction condition and validation helper.
3. **Budget Overrun Injection**: Team with ৳20,000 purse attempts to place a ৳1,00,000 bid.
   * *Expected*: REJECTED by team remaining budget check.
4. **Post-Deadline / Expired Bid**: Attacker attempts to inject bid after timer has expired or status is `sold`.
   * *Expected*: REJECTED as status is not `active`.
5. **Self-Promotion to Admin**: Standard team user attempts to write to `/admins/{their_uid}` or update `role: 'admin'`.
   * *Expected*: REJECTED by admin-only write guard.
6. **Rogue Sold Trigger**: Non-admin attempts to set auction status to `sold` and assign player to their team.
   * *Expected*: REJECTED by `isAdmin()` check on auction state.
7. **Phantom Player Registration Approval**: Unapproved applicant updates their own `approvalStatus: 'approved'`.
   * *Expected*: REJECTED; only admin can mutate `approvalStatus`.
8. **Audit Trail Tampering**: Team tries to delete or edit previous bid history or audit logs.
   * *Expected*: REJECTED; audit logs allow no update or delete.
9. **Junk Field Pollution**: Request with 500KB garbage payload attempting to bloat Firestore documents.
   * *Expected*: REJECTED by strict key checks and `.size()` limits.
10. **Squad Limit Bypass**: Team with maximum 15 players attempts to purchase a 16th player.
    * *Expected*: REJECTED by squad count enforcement.
11. **Negative Budget Tampering**: Non-admin modifies `remainingBudget` directly on `/teams/{teamId}`.
    * *Expected*: REJECTED; team budget mutations are restricted to Admin or backend transactions.
12. **Double Sold Exploit**: Attempting to sell an already SOLD player to a second team.
    * *Expected*: REJECTED; player in terminal `sold` state cannot be mutated by teams.

---

## 3. Test Runner & Verification
All write and read gates are mapped to explicit rule blocks tested during rules compilation and verified with client Firestore operations.
