import React, { useState, useEffect } from 'react';
import './App.css';
import { Plus, DollarSign, Star, Edit2, Trash2, Calendar, LogOut, CheckCircle2, X, ArrowRight, TrendingUp } from 'lucide-react';

// Firebase imports
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, sendEmailVerification, reauthenticateWithCredential, EmailAuthProvider, deleteUser, setPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';
import { getDatabase, ref, set, get, remove, onValue, update } from 'firebase/database';

// Firebase configuration — values loaded from .env (never hardcode secrets in source)
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

const APP_VERSION = '1.0.0';
const ADMIN_UID = 'gTcRGsA5RVTd7uhXtosq7cOCyAh2'; // eugenenicholson@gmail.com

// SHA-256 hash utility using Web Crypto API (no external dependency)
const hashPin = async (pin) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + 'chorechain-salt-v1');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// Mascot SVG — reused across screens
const MascotSVG = ({ className = '' }) => (
  <svg className={className} viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="80" cy="108" rx="30" ry="26" fill="#c8ff47"/>
    <path d="M107 95 Q118 82 125 72" stroke="#c8ff47" strokeWidth="10" strokeLinecap="round" fill="none"/>
    <ellipse cx="44" cy="105" rx="11" ry="7" fill="#c8ff47" transform="rotate(-15 44 105)"/>
    <circle cx="80" cy="70" r="28" fill="#c8ff47"/>
    <ellipse cx="72" cy="58" rx="10" ry="7" fill="white" opacity="0.2"/>
    <path d="M65 65 Q70 60 75 65" stroke="#1a1a2e" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
    <path d="M85 65 Q90 60 95 65" stroke="#1a1a2e" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
    <path d="M64 76 Q80 90 96 76" stroke="#1a1a2e" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
    <path d="M64 76 Q80 84 96 76" fill="white" opacity="0.9"/>
    <ellipse cx="62" cy="75" rx="7" ry="4.5" fill="#ffb3c8" opacity="0.55"/>
    <ellipse cx="98" cy="75" rx="7" ry="4.5" fill="#ffb3c8" opacity="0.55"/>
    <path d="M72 42 Q80 34 88 42" stroke="#1a1a2e" strokeWidth="3" strokeLinecap="round" fill="none"/>
    <rect x="64" y="128" width="13" height="19" rx="6.5" fill="#9b5de5"/>
    <rect x="83" y="128" width="13" height="19" rx="6.5" fill="#9b5de5"/>
    <ellipse cx="70" cy="148" rx="10" ry="5.5" fill="#1a1a2e"/>
    <ellipse cx="89" cy="148" rx="10" ry="5.5" fill="#1a1a2e"/>
    <line x1="124" y1="73" x2="142" y2="46" stroke="#ffe347" strokeWidth="3.5" strokeLinecap="round"/>
    <path d="M142 38 L144.2 44.8 L151.5 44.8 L145.6 48.9 L147.8 55.7 L142 51.6 L136.2 55.7 L138.4 48.9 L132.5 44.8 L139.8 44.8 Z" fill="#ffe347"/>
    <circle cx="142" cy="44" r="6" fill="#ffe347" opacity="0.25"/>
    <circle cx="133" cy="58" r="2.5" fill="#ffe347" opacity="0.7"/>
    <circle cx="124" cy="66" r="1.8" fill="#ffe347" opacity="0.45"/>
  </svg>
);

// Inline mini logo for nav / small uses — reserved for future use
// eslint-disable-next-line no-unused-vars
const LogoIcon = () => (
  <svg width="32" height="32" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="36" height="36" rx="10" fill="#c8ff47"/>
    <circle cx="18" cy="17" r="9" fill="#1a1a2e"/>
    <circle cx="15" cy="15.5" r="1.5" fill="#c8ff47"/>
    <circle cx="21" cy="15.5" r="1.5" fill="#c8ff47"/>
    <path d="M13.5 19.5 Q18 23.5 22.5 19.5" stroke="#c8ff47" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
    <line x1="22" y1="12" x2="28" y2="6" stroke="#ffe347" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="28.5" cy="5.5" r="2.5" fill="#ffe347"/>
  </svg>
);

// Child PIN management modal
const ChildPinModal = ({ child, onSave, onClear, onClose }) => {
  const [newPin, setNewPin] = React.useState('');
  const [confirmPin, setConfirmPin] = React.useState('');
  const [pinError, setPinError] = React.useState('');
  return (
    <div className="child-pin-modal-overlay" onClick={onClose}>
      <div className="child-pin-modal-sheet" onClick={e => e.stopPropagation()}>
        <p className="child-pin-modal-title">{child.name}'s PIN</p>
        <p className="child-pin-modal-sub">{child.pin ? 'Set a new PIN or clear it' : 'Set a 4–6 digit PIN'}</p>
        <input
          type="password" inputMode="numeric" placeholder="New PIN (4–6 digits)"
          value={newPin} autoFocus
          onChange={(e) => { setNewPin(e.target.value.replace(/\D/g,'').slice(0,6)); setPinError(''); }}
          className="input input--pin mb-3"
        />
        <input
          type="password" inputMode="numeric" placeholder="Confirm PIN"
          value={confirmPin}
          onChange={(e) => { setConfirmPin(e.target.value.replace(/\D/g,'').slice(0,6)); setPinError(''); }}
          className="input input--pin mb-3"
        />
        {pinError && <p className="error-msg mb-3">{pinError}</p>}
        <button className="btn btn-primary mb-2" onClick={() => {
          if (newPin.length < 4) { setPinError('PIN must be at least 4 digits'); return; }
          if (newPin !== confirmPin) { setPinError('PINs do not match'); return; }
          onSave(child.id, newPin);
        }}>Save PIN</button>
        {child.pin && (
          <button className="btn btn-danger mb-2" onClick={() => { if (window.confirm(`Clear PIN for ${child.name}?`)) onClear(child.id); }}>
            🗑 Clear PIN
          </button>
        )}
        <button className="btn btn-ghost w-full" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
};

const FamilyChoreApp = () => {
  // Auth state
  const [currentUser, setCurrentUser] = useState(null);
  const [currentChildId, setCurrentChildId] = useState(null);
  const [familyId, setFamilyId] = useState(null);
  
  // UI state
  const [screen, setScreen] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [childName, setChildName] = useState('');
  const [pinAttempt, setPinAttempt] = useState('');
  const [parentPin, setParentPin] = useState('');
  const [settingPin, setSettingPin] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [payslipChild, setPayslipChild] = useState(null);
  // Rate limiting — shared across parent and child PIN screens
  const [pinFailCount, setPinFailCount] = useState(0);
  const [pinLockedUntil, setPinLockedUntil] = useState(null);
  const [lockCountdown, setLockCountdown] = useState(0); // child object to show payslip for
  const signingUpRef = React.useRef(false); // prevents onAuthStateChanged racing with signUp
  const [pendingChildId, setPendingChildId] = useState(null); // child selected, awaiting PIN
  const [childPinAttempt, setChildPinAttempt] = useState('');
  const [childPinError, setChildPinError] = useState('');
  const [managingPinFor, setManagingPinFor] = useState(null); // child object for PIN mgmt in parent
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [pinBypassMode, setPinBypassMode] = useState(false);
  const [pinBypassPassword, setPinBypassPassword] = useState('');
  const [pinBypassError, setPinBypassError] = useState('');
  const [changePinMode, setChangePinMode] = useState(false);
  const [deleteAccountMode, setDeleteAccountMode] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState('');
  const [deleteAccountError, setDeleteAccountError] = useState('');
  const [joinFamilyMode, setJoinFamilyMode] = useState(false);
  const [joinFamilyCode, setJoinFamilyCode] = useState('');
  const [childPayslip, setChildPayslip] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [adminData, setAdminData] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [deletingFamily, setDeletingFamily] = useState(null);
  const [expandedFamily, setExpandedFamily] = useState(null);

  // Rate limiting: track failed PIN/login attempts in memory
  const failedAttemptsRef = React.useRef({}); // { key: { count, lockedUntil } }

  const recordFailedAttempt = (key) => {
    const now = Date.now();
    const entry = failedAttemptsRef.current[key] || { count: 0, lockedUntil: 0 };
    entry.count += 1;
    // Lock for progressively longer: 3 fails=30s, 5 fails=5min, 10 fails=30min
    if (entry.count >= 10) entry.lockedUntil = now + 30 * 60 * 1000;
    else if (entry.count >= 5) entry.lockedUntil = now + 5 * 60 * 1000;
    else if (entry.count >= 3) entry.lockedUntil = now + 30 * 1000;
    failedAttemptsRef.current[key] = entry;
    return entry.count;
  };

  const isLockedOut = (key) => {
    const entry = failedAttemptsRef.current[key];
    if (!entry) return false;
    if (entry.lockedUntil > Date.now()) {
      const secsLeft = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
      return secsLeft;
    }
    return false;
  };

  const clearAttempts = (key) => {
    delete failedAttemptsRef.current[key];
  };

  // Data state
  const [familyData, setFamilyData] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [newTemplate, setNewTemplate] = useState({
    title: '',
    amount: '',
    frequency: 'once',
    dayOfWeek: 0,
    specificDays: [],
    assignType: 'any',
    assignedChild: null,
    rotateChildren: []
  });

  // Detect invite deep link — e.g. /join/IYH8YC7V
  // Store in a ref so it survives onAuthStateChanged overwriting screen state
  const inviteCodeRef = React.useRef(null);
  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/join\/([A-Z0-9]{8})$/i);
    if (match) {
      const code = match[1].toUpperCase();
      inviteCodeRef.current = code;
      setJoinFamilyCode(code);
      // Clean the URL immediately
      window.history.replaceState({}, '', '/');
    }
  }, []);

  // Listen to auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (signingUpRef.current) return; // signup handles its own navigation
      if (user) {
        setCurrentUser(user);
        // If there's a pending invite link, go to join screen instead of family-home
        if (inviteCodeRef.current) {
          setJoinFamilyCode(inviteCodeRef.current);
          setJoinFamilyMode(true);
          inviteCodeRef.current = null;
          setScreen('signup');
          return;
        }
        // Security: look up the user's familyId directly via their uid index
        // rather than scanning all families (prevents reading other families' data)
        const userFamilyRef = ref(database, `userFamilies/${user.uid}`);
        const userFamilySnap = await get(userFamilyRef);
        
        let fid = null;
        if (userFamilySnap.exists()) {
          fid = userFamilySnap.val();
        } else {
          // Fallback: scan families for legacy accounts that predate the index
          const familiesRef = ref(database, 'families');
          const snapshot = await get(familiesRef);
          if (snapshot.exists()) {
            const families = snapshot.val();
            for (const id in families) {
              if (families[id].members && families[id].members[user.uid]) {
                fid = id;
                // Write the index so future logins are fast and secure
                await set(userFamilyRef, fid);
                break;
              }
            }
          }
        }

        if (fid) {
          setFamilyId(fid);
          const familyRef = ref(database, `families/${fid}`);
          onValue(familyRef, (snap) => {
            if (snap.exists()) {
              const data = snap.val();
              setFamilyData(data);
              generateWeeklyTasks(fid, data);
            }
          });
          setScreen('family-home');
        }
      } else {
        setCurrentUser(null);
        setFamilyId(null);
        setFamilyData(null);
        // If there's a pending invite, go to signup/join screen
        if (inviteCodeRef.current) {
          setJoinFamilyCode(inviteCodeRef.current);
          setJoinFamilyMode(true);
          inviteCodeRef.current = null;
          setScreen('signup');
        } else {
          setScreen('login');
        }
      }
    });
    return unsubscribe;
  }, []);

  // Sign up
  const signUp = async () => {
    setErrorMsg('');
    if (!familyName || !email || !password) {
      setErrorMsg('Please fill in all fields');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    signingUpRef.current = true;
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;
      const newFamilyId = Math.random().toString(36).substring(2, 10).toUpperCase();
      
      const familyRef = ref(database, `families/${newFamilyId}`);
      // Write uid→familyId index for secure, direct lookup on future logins
      await set(ref(database, `userFamilies/${uid}`), newFamilyId);
      const newFamilyData = {
        name: familyName,
        parentId: uid,
        members: {
          [uid]: { email, role: 'parent', name: email.split('@')[0] }
        },
        children: [],
        taskTemplates: [],
        childTasks: {},
        parentPin: '',
        createdAt: new Date().toISOString()
      };
      await set(familyRef, newFamilyData);

      // Set all state before navigating so family-home renders correctly
      setCurrentUser(userCredential.user);
      setFamilyId(newFamilyId);
      setFamilyData(newFamilyData);
      setFamilyName('');
      setEmail('');
      setPassword('');
      // Send email verification
      try { await sendEmailVerification(userCredential.user); } catch (_) {}

      // Set up live listener for future updates
      onValue(familyRef, (snap) => {
        if (snap.exists()) {
          const data = snap.val();
          setFamilyData(data);
          generateWeeklyTasks(newFamilyId, data);
        }
      });

      setScreen('family-home');
    } catch (error) {
      setErrorMsg(error.message);
    } finally {
      signingUpRef.current = false;
      setLoading(false);
    }
  };

  // Sign in
  const signIn = async () => {
    setErrorMsg('');
    if (!email || !password) {
      setErrorMsg('Please enter email and password');
      return;
    }
    const lockKey = `login_${email}`;
    const locked = isLockedOut(lockKey);
    if (locked) {
      setErrorMsg(`Too many failed attempts. Try again in ${locked}s.`);
      return;
    }

    setLoading(true);
    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      await signInWithEmailAndPassword(auth, email, password);
      clearAttempts(lockKey);
      setEmail('');
      setPassword('');
    } catch (error) {
      const count = recordFailedAttempt(lockKey);
      if (count >= 3) {
        const secs = isLockedOut(lockKey);
        setErrorMsg(`Incorrect credentials. Account locked for ${secs}s.`);
      } else {
        setErrorMsg('Incorrect email or password.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Forgot password
  const sendPasswordReset = async () => {
    setErrorMsg('');
    if (!email) {
      setErrorMsg('Please enter your email address first');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetEmailSent(true);
    } catch (error) {
      setErrorMsg('Could not send reset email. Check the address and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Bypass PIN using account password (for forgotten PIN)
  const bypassPinWithPassword = async () => {
    setPinBypassError('');
    if (!pinBypassPassword) {
      setPinBypassError('Please enter your account password');
      return;
    }
    setLoading(true);
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, pinBypassPassword);
      await reauthenticateWithCredential(currentUser, credential);
      // Password verified — go straight to PIN setup
      setPinBypassMode(false);
      setPinBypassPassword('');
      setSettingPin(true);
    } catch (error) {
      setPinBypassError('Incorrect password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Delete account and all family data
  const deleteAccount = async () => {
    setDeleteAccountError('');
    if (!deleteAccountPassword) {
      setDeleteAccountError('Please enter your password to confirm');
      return;
    }
    setLoading(true);
    try {
      // Re-authenticate first (Firebase requires this before deletion)
      const credential = EmailAuthProvider.credential(currentUser.email, deleteAccountPassword);
      await reauthenticateWithCredential(currentUser, credential);

      // Delete all family data from database
      if (familyId) {
        await remove(ref(database, `families/${familyId}`));
        await remove(ref(database, `userFamilies/${currentUser.uid}`));
      }

      // Delete the Firebase Auth account
      await deleteUser(currentUser);

      // onAuthStateChanged will fire and reset to login screen
    } catch (error) {
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setDeleteAccountError('Incorrect password. Please try again.');
      } else {
        setDeleteAccountError('Could not delete account. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Join an existing family using family code
  const joinFamily = async (overrideUid, overrideEmail) => {
    setErrorMsg('');
    const code = joinFamilyCode.trim().toUpperCase();
    if (!code) { setErrorMsg('Please enter a family code'); return; }
    setLoading(true);
    try {
      const familyRef = ref(database, `families/${code}`);
      const snap = await get(familyRef);
      if (!snap.exists()) {
        setErrorMsg('Family code not found. Check and try again.');
        setLoading(false);
        return;
      }
      const uid = overrideUid || currentUser.uid;
      const email = overrideEmail || currentUser.email;
      // Add this user as a member of the family
      await set(ref(database, `families/${code}/members/${uid}`), {
        email: email,
        role: 'parent',
        name: email.split('@')[0]
      });
      // Update their userFamilies index to point to new family
      await set(ref(database, `userFamilies/${uid}`), code);
      setFamilyId(code);
      setJoinFamilyMode(false);
      setJoinFamilyCode('');
      // Listen to the new family
      onValue(familyRef, (s) => {
        if (s.exists()) {
          const data = s.val();
          setFamilyData(data);
          generateWeeklyTasks(code, data);
        }
      });
      setScreen('family-home');
    } catch (error) {
      setErrorMsg('Could not join family. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Admin — load all families
  const loadAdminData = async () => {
    setAdminLoading(true);
    try {
      const [familiesSnap, userFamiliesSnap] = await Promise.all([
        get(ref(database, 'families')),
        get(ref(database, 'userFamilies'))
      ]);
      const families = familiesSnap.exists() ? familiesSnap.val() : {};
      const userFamilies = userFamiliesSnap.exists() ? userFamiliesSnap.val() : {};
      const familyToUids = {};
      Object.entries(userFamilies).forEach(([uid, fid]) => {
        if (!familyToUids[fid]) familyToUids[fid] = [];
        familyToUids[fid].push(uid);
      });
      const result = Object.entries(families).map(([fid, data]) => ({
        familyId: fid,
        name: data.name || '(unnamed)',
        createdAt: data.createdAt || null,
        memberCount: data.members ? Object.keys(data.members).length : 0,
        childCount: data.children ? Object.keys(data.children).length : 0,
        members: data.members || {},
        children: data.children || {},
        taskTemplates: data.taskTemplates || {},
        childTasks: data.childTasks || {},
        rewardMode: data.rewardMode || 'dollars',
        pointsPerDollar: data.pointsPerDollar || 100,
        payday: data.payday != null ? data.payday : 5,
        parentPin: data.parentPin ? '••••' : 'Not set',
        pinHashed: data.pinHashed || false,
        uids: familyToUids[fid] || [],
      }));
      setAdminData(result);
    } catch (e) {
      console.error('Admin load error', e);
    } finally {
      setAdminLoading(false);
    }
  };

  // Admin — delete a family and all its userFamilies entries
  const adminDeleteFamily = async (familyId, uids) => {
    try {
      await remove(ref(database, `families/${familyId}`));
      await Promise.all(uids.map(uid => remove(ref(database, `userFamilies/${uid}`))));
      setAdminData(prev => prev.filter(f => f.familyId !== familyId));
      setDeletingFamily(null);
    } catch (e) {
      console.error('Admin delete error', e);
    }
  };

  // Logout
  const logout = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      await signOut(auth);
      setCurrentUser(null);
      setFamilyId(null);
      setFamilyData(null);
      setScreen('login');
    } catch (error) {
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Add child
  // eslint-disable-next-line no-unused-vars
  const addChildToFamily = async () => {
    setErrorMsg('');
    if (!childName) {
      setErrorMsg('Please enter child name');
      return;
    }

    try {
      const childId = `child${Date.now()}`;
      const childRef = ref(database, `families/${familyId}/children/${childId}`);
      await set(childRef, { id: childId, name: childName });
      setChildName('');
    } catch (error) {
      setErrorMsg(error.message);
    }
  };

  // Create task template
  const createTaskTemplate = async () => {
    setErrorMsg('');
    const template = editingTemplate || newTemplate;
    
    if (!template.title || !template.amount) {
      setErrorMsg('Please fill in title and amount');
      return;
    }

    if (template.frequency === 'specific' && template.specificDays.length === 0) {
      setErrorMsg('Select at least one day');
      return;
    }

    if (template.assignType === 'rotate' && template.rotateChildren.length < 2) {
      setErrorMsg('Select at least 2 children to rotate');
      return;
    }

    try {
      const templateId = editingTemplate ? editingTemplate.id : `template${Date.now()}`;
      const templateRef = ref(database, `families/${familyId}/taskTemplates/${templateId}`);
      await set(templateRef, {
        id: templateId,
        ...template
      });

      setNewTemplate({
        title: '',
        amount: '',
        frequency: 'once',
        dayOfWeek: 0,
        specificDays: [],
        assignType: 'any',
        assignedChild: null,
        rotateChildren: []
      });
      setEditingTemplate(null);
    } catch (error) {
      setErrorMsg(error.message);
    }
  };

  // Delete task template
  // eslint-disable-next-line no-unused-vars
  const deleteTaskTemplate = async (templateId) => {
    try {
      const templateRef = ref(database, `families/${familyId}/taskTemplates/${templateId}`);
      await remove(templateRef);
    } catch (error) {
      setErrorMsg(error.message);
    }
  };

  // Generate child tasks from templates for the current week
  const generateWeeklyTasks = async (fid, data) => {
    if (!data?.taskTemplates) return;

    // Firebase can return arrays as sparse objects {0: "val"} — normalise to real arrays
    const toArray = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      if (typeof val === 'object') return Object.values(val);
      return [];
    };

    const today = new Date();
    const todayDow = today.getDay();

    // payday is the last day of the chore week (0=Sun..6=Sat), default Friday=5
    const payday = data.payday != null ? data.payday : 5;
    // weekStart = day after payday
    const weekStartDow = (payday + 1) % 7;
    // How many days back to reach the start of this chore week
    const daysBack = (todayDow - weekStartDow + 7) % 7;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - daysBack);
    const weekKey = weekStart.toISOString().split('T')[0];

    // Stable week number from a fixed epoch Saturday (2024-01-06 is a Saturday)
    const epochStart = new Date('2024-01-06');
    const weekNumber = Math.floor((weekStart - epochStart) / (7 * 24 * 60 * 60 * 1000));

    // Get existing tasks so we can preserve completed/accepted state
    const existingTasksRef = ref(database, `families/${fid}/childTasks`);
    const existingSnap = await get(existingTasksRef);
    const existingTasks = existingSnap.exists() ? existingSnap.val() : {};

    const templates = Object.values(data.taskTemplates);
    const newTasks = {};

    templates.forEach(template => {
      let daysToGenerate = [];
      if (template.frequency === 'daily') {
        daysToGenerate = [0, 1, 2, 3, 4, 5, 6];
      } else if (template.frequency === 'weekly') {
        daysToGenerate = [parseInt(template.dayOfWeek)];
      } else if (template.frequency === 'specific') {
        daysToGenerate = (template.specificDays || []).map(d => parseInt(d));
      } else if (template.frequency === 'once') {
        daysToGenerate = [todayDow];
      }

      if (template.assignType === 'rotate' && template.rotateChildren?.length >= 2) {
        // Sort days in chore-week order starting from weekStartDow
        const sortedDays = [...daysToGenerate].sort((a, b) => {
          const order = d => (d - weekStartDow + 7) % 7;
          return order(a) - order(b);
        });
        sortedDays.forEach((dow, occurrenceIdx) => {
          let rotationIdx;
          if (template.frequency === 'daily') {
            // Each occurrence in the week alternates: Mon=child1, Tue=child2, Wed=child1...
            // Then shifts by weekNumber so child1 doesn't always get Mon
            rotationIdx = (occurrenceIdx + weekNumber) % template.rotateChildren.length;
          } else if (template.frequency === 'weekly') {
            // One occurrence per week — rotate by week only
            rotationIdx = weekNumber % template.rotateChildren.length;
          } else if (template.frequency === 'specific') {
            // Specific days: alternate each occurrence, also shift by week
            rotationIdx = (occurrenceIdx + weekNumber) % template.rotateChildren.length;
          } else {
            // once — rotate by week
            rotationIdx = weekNumber % template.rotateChildren.length;
          }
          const childId = template.rotateChildren[rotationIdx];
          const taskId = `${template.id}_${weekKey}_day${dow}`;
          const existing = existingTasks[taskId] || {};
          newTasks[taskId] = {
            ...existing,
            id: taskId,
            templateId: template.id,
            title: template.title,
            amount: template.amount,
            assignType: 'assigned',
            assignedChild: childId,
            dayOfWeek: dow,
            weekKey,
            accepted: toArray(existing.accepted),
            completed: toArray(existing.completed)
          };
        });
      } else if (template.assignType === 'assigned' && template.assignedChild) {
        daysToGenerate.forEach(dow => {
          const taskId = `${template.id}_${weekKey}_day${dow}`;
          const existing = existingTasks[taskId] || {};
          newTasks[taskId] = {
            ...existing,
            id: taskId,
            templateId: template.id,
            title: template.title,
            amount: template.amount,
            assignType: 'assigned',
            assignedChild: template.assignedChild,
            dayOfWeek: dow,
            weekKey,
            accepted: toArray(existing.accepted),
            completed: toArray(existing.completed)
          };
        });
      } else {
        daysToGenerate.forEach(dow => {
          const taskId = `${template.id}_${weekKey}_day${dow}`;
          const existing = existingTasks[taskId] || {};
          newTasks[taskId] = {
            ...existing,
            id: taskId,
            templateId: template.id,
            title: template.title,
            amount: template.amount,
            assignType: 'any',
            assignedChild: null,
            dayOfWeek: dow,
            weekKey,
            accepted: toArray(existing.accepted),
            completed: toArray(existing.completed)
          };
        });
      }
    });

    // Write tasks — only write new tasks, never overwrite ones with existing progress
    // Use individual set() calls for new tasks only, preserving any completed/accepted state
    const tasksRef = ref(database, `families/${fid}/childTasks`);

    // Only write tasks that don't already exist in the database, or exist but have no progress
    const writePromises = Object.entries(newTasks).map(async ([taskId, task]) => {
      const existingTask = existingTasks[taskId];
      // If task already exists with any completed or accepted entries, don't touch it
      if (existingTask) {
        const hasCompleted = toArray(existingTask.completed).length > 0;
        const hasAccepted = toArray(existingTask.accepted).length > 0;
        if (hasCompleted || hasAccepted) return; // preserve progress, skip write
      }
      // New task or task with no progress — safe to write
      await set(ref(database, `families/${fid}/childTasks/${taskId}`), task);
    });

    await Promise.all(writePromises);

    // Remove tasks from previous weeks (different weekKey) that no longer have a template
    const validTaskIds = new Set(Object.keys(newTasks));
    const removePromises = Object.keys(existingTasks)
      .filter(taskId => !validTaskIds.has(taskId) && existingTasks[taskId].weekKey !== weekKey)
      .map(taskId => remove(ref(database, `families/${fid}/childTasks/${taskId}`)));
    await Promise.all(removePromises);

    await set(ref(database, `families/${fid}/lastGeneratedWeek`), weekKey);
  };

  // Re-generate tasks ONLY when templates change — not on every family data update
  // Using a ref to track the last templates string to avoid unnecessary regeneration
  const lastTemplatesRef = React.useRef(null);
  useEffect(() => {
    if (!familyId || !familyData?.taskTemplates) return;
    const templatesStr = JSON.stringify(familyData.taskTemplates);
    if (templatesStr === lastTemplatesRef.current) return; // templates unchanged — skip
    lastTemplatesRef.current = templatesStr;
    generateWeeklyTasks(familyId, familyData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, JSON.stringify(familyData?.taskTemplates)]);

  // Accept task
  const acceptTask = async (taskId) => {
    try {
      const taskRef = ref(database, `families/${familyId}/childTasks/${taskId}`);
      const snapshot = await get(taskRef);
      const task = snapshot.val() || {};
      const accepted = Array.isArray(task.accepted) ? task.accepted : Object.values(task.accepted || {});
      if (!accepted.includes(currentChildId)) {
        await update(taskRef, { accepted: [...accepted, currentChildId] });
      }
    } catch (error) {
      setErrorMsg(error.message);
    }
  };

  // Complete task
  const completeTask = async (taskId) => {
    try {
      const taskRef = ref(database, `families/${familyId}/childTasks/${taskId}`);
      const snapshot = await get(taskRef);
      const task = snapshot.val() || {};
      const completed = Array.isArray(task.completed) ? task.completed : Object.values(task.completed || {});
      if (!completed.includes(currentChildId)) {
        await update(taskRef, { completed: [...completed, currentChildId] });
      }
    } catch (error) {
      setErrorMsg(error.message);
    }
  };

  // Unselect task
  const unselectTask = async (taskId) => {
    try {
      const taskRef = ref(database, `families/${familyId}/childTasks/${taskId}`);
      const snapshot = await get(taskRef);
      const task = snapshot.val() || {};
      const accepted = Array.isArray(task.accepted) ? task.accepted : Object.values(task.accepted || {});
      const completed = Array.isArray(task.completed) ? task.completed : Object.values(task.completed || {});
      await update(taskRef, {
        accepted: accepted.filter(id => id !== currentChildId),
        completed: completed.filter(id => id !== currentChildId),
      });
    } catch (error) {
      setErrorMsg(error.message);
    }
  };

  // Save PIN
  const saveParentPin = async () => {
    setErrorMsg('');
    if (parentPin.length < 4 || !/^\d+$/.test(parentPin)) {
      setErrorMsg('PIN must be at least 4 digits');
      return;
    }

    try {
      const hashed = await hashPin(parentPin);
      const pinRef = ref(database, `families/${familyId}/parentPin`);
      await set(pinRef, hashed);
      // Store a flag so we know this is a hashed PIN
      await set(ref(database, `families/${familyId}/pinHashed`), true);
      setScreen('parent');
      setParentPin('');
    } catch (error) {
      setErrorMsg(error.message);
    }
  };

  // Save payday setting
  const savePayday = async (day) => {
    try {
      await set(ref(database, `families/${familyId}/payday`), day);
      // Clear lastGeneratedWeek so tasks regenerate with new week boundaries
      await set(ref(database, `families/${familyId}/lastGeneratedWeek`), null);
    } catch (error) {
      setErrorMsg(error.message);
    }
  };

  // Save reward mode (dollars or points) and conversion rate
  const saveRewardMode = async (mode) => {
    try {
      await set(ref(database, `families/${familyId}/rewardMode`), mode);
    } catch (error) {
      setErrorMsg(error.message);
    }
  };

  const savePointsPerDollar = async (val) => {
    try {
      const num = parseInt(val);
      if (num > 0) await set(ref(database, `families/${familyId}/pointsPerDollar`), num);
    } catch (error) {
      setErrorMsg(error.message);
    }
  };

  // Save child PIN
  const saveChildPin = async (childId, pin) => {
    try {
      const hashed = await hashPin(pin);
      await set(ref(database, `families/${familyId}/children/${childId}/pin`), hashed);
      await set(ref(database, `families/${familyId}/children/${childId}/pinHashed`), true);
      setManagingPinFor(null);
    } catch (error) {
      setErrorMsg(error.message);
    }
  };

  // Clear child PIN (parent reset)
  const clearChildPin = async (childId) => {
    try {
      await set(ref(database, `families/${familyId}/children/${childId}/pin`), null);
      setManagingPinFor(null);
    } catch (error) {
      setErrorMsg(error.message);
    }
  };

  // PIN rate limiting helpers
  const PIN_MAX_ATTEMPTS = 5;
  const PIN_LOCKOUT_SECONDS = 30;

  const recordPinFailure = () => {
    const newCount = pinFailCount + 1;
    setPinFailCount(newCount);
    if (newCount >= PIN_MAX_ATTEMPTS) {
      const until = Date.now() + PIN_LOCKOUT_SECONDS * 1000;
      setPinLockedUntil(until);
      setLockCountdown(PIN_LOCKOUT_SECONDS);
      setPinFailCount(0);
    }
  };

  const isPinLocked = () => pinLockedUntil && Date.now() < pinLockedUntil;

  // Countdown timer for lockout
  useEffect(() => {
    if (!pinLockedUntil) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((pinLockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setPinLockedUntil(null);
        setLockCountdown(0);
        clearInterval(interval);
      } else {
        setLockCountdown(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [pinLockedUntil]);

  // Helper: derive reward display values from familyData
  const isPoints = () => familyData?.rewardMode === 'points';
  const pointsPerDollar = () => familyData?.pointsPerDollar || 100;
  const formatReward = (amount) => {
    const num = parseFloat(amount || 0);
    if (isPoints()) {
      return `${Math.round(num * pointsPerDollar())} pts`;
    }
    return `$${num.toFixed(2)}`;
  };

  // Calculate child earnings
  const calculateChildEarnings = (childId) => {
    let total = 0;
    if (familyData?.childTasks) {
      Object.values(familyData.childTasks).forEach(task => {
        if (task.completed && task.completed.includes(childId)) {
          total += parseFloat(task.amount || 0);
        }
      });
    }
    return total;
  };

  // Process weekly payout
  const processWeeklyPayout = async () => {
    try {
      const now = new Date();
      const payday = familyData?.payday != null ? familyData.payday : 5;
      const weekStartDow = (payday + 1) % 7;
      const daysBack = (now.getDay() - weekStartDow + 7) % 7;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - daysBack);
      
      if (familyData?.children) {
        Object.values(familyData.children).forEach(async (child) => {
          const earnings = calculateChildEarnings(child.id);
          const payoutRef = ref(database, `families/${familyId}/payouts/${child.id}_${now.getTime()}`);
          await set(payoutRef, {
            childId: child.id,
            amount: earnings,
            date: now.toISOString(),
            week: weekStart.toISOString()
          });
        });
      }
      
      // Clear tasks
      const tasksRef = ref(database, `families/${familyId}/childTasks`);
      await set(tasksRef, {});
      
      alert('Weekly payout processed!');
    } catch (error) {
      setErrorMsg(error.message);
    }
  };

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // LOGIN SCREEN
  if (screen === 'login') {
    return (
      <div className="screen">
        <div className="container-sm" style={{paddingTop:'3rem'}}>
          <div className="auth-logo-wrap">
            <MascotSVG className="auth-mascot" />
            <p className="auth-wordmark">Chore<span>Chain</span></p>
            <p className="auth-tagline">Family tasks made fair</p>
            <p className="auth-version">v{APP_VERSION}</p>
          </div>

          <div className="card space-y-3">
            <p className="section-title" style={{fontSize:'1.3rem',marginBottom:'0.25rem'}}>Sign In</p>
            <input type="email" placeholder="Email address" value={email}
              onChange={(e) => setEmail(e.target.value)} className="input" disabled={loading} />
            <input type="password" placeholder="Password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && signIn()}
              className="input" disabled={loading} />
            <label className="checkbox-label">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
              Remember me
            </label>
            {errorMsg && <p className="error-msg">{errorMsg}</p>}
            <button onClick={signIn} disabled={loading || !!isLockedOut(`login_${email}`)} className="btn btn-primary">
              {loading ? 'Signing in…' : isLockedOut(`login_${email}`) ? `Locked (${isLockedOut(`login_${email}`)}s)` : <>Sign In <ArrowRight size={16}/></>}
            </button>

            {!forgotPasswordMode ? (
              <p className="text-center">
                <button className="pin-forgot-btn" onClick={() => { setForgotPasswordMode(true); setErrorMsg(''); setResetEmailSent(false); }}>
                  Forgot password?
                </button>
              </p>
            ) : (
              <div className="pin-bypass-card">
                <p>Enter your email above and we'll send a reset link.</p>
                {resetEmailSent
                  ? <p className="success-msg">✅ Reset email sent! Check your inbox.</p>
                  : <button className="btn btn-teal" onClick={sendPasswordReset} disabled={loading}>{loading ? 'Sending…' : 'Send Reset Email'}</button>
                }
                <button className="btn btn-ghost w-full" onClick={() => { setForgotPasswordMode(false); setResetEmailSent(false); setErrorMsg(''); }}>Cancel</button>
              </div>
            )}

            <hr className="divider"/>
            <p className="text-center text-sm text-muted">Don't have an account?</p>
            <button className="btn btn-secondary" onClick={() => { setScreen('signup'); setEmail(''); setPassword(''); setErrorMsg(''); }}>
              Create a Family Account
            </button>
            <button className="btn btn-ghost w-full" onClick={() => { setScreen('signup'); setJoinFamilyMode(true); setEmail(''); setPassword(''); setErrorMsg(''); }}>
              Join an Existing Family
            </button>
          </div>
        </div>
      </div>
    );
  }

  // SIGNUP SCREEN
  if (screen === 'signup') {
    return (
      <div className="screen">
        <div className="container-sm" style={{paddingTop:'2rem'}}>
          <button className="btn btn-back mb-4" style={{width:'auto'}}
            onClick={() => { setScreen('login'); setJoinFamilyMode(false); setJoinFamilyCode(''); setErrorMsg(''); }}>
            ← Back
          </button>
          <div className="card space-y-3">
            <p className="section-title" style={{fontSize:'1.3rem',marginBottom:'0.25rem'}}>
              {joinFamilyMode ? 'Join a Family' : 'Create Family Account'}
            </p>
            {joinFamilyMode ? (
              <>
                <p className="text-sm text-muted">Ask the family admin for their 8-character family code.</p>
                <input type="email" placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" disabled={loading} />
                <input type="password" placeholder="Password (min 6 characters)" value={password} onChange={(e) => setPassword(e.target.value)} className="input" disabled={loading} />
                <input type="text" placeholder="Family code (e.g. XXXXXXXX)" value={joinFamilyCode}
                  onChange={(e) => setJoinFamilyCode(e.target.value.toUpperCase())}
                  className="input input--mono" maxLength={8} disabled={loading} />
                {errorMsg && <p className="error-msg">{errorMsg}</p>}
                <button className="btn btn-primary" disabled={loading} onClick={async () => {
                  setErrorMsg('');
                  if (!email || !password || !joinFamilyCode) { setErrorMsg('Please fill in all fields'); return; }
                  if (password.length < 6) { setErrorMsg('Password must be at least 6 characters'); return; }
                  setLoading(true); signingUpRef.current = true;
                  try {
                    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                    setCurrentUser(userCredential.user);
                    try { await sendEmailVerification(userCredential.user); } catch (_) {}
                    await joinFamily(userCredential.user.uid, userCredential.user.email);
                  } catch (error) {
                    if (error.code === 'auth/email-already-in-use') {
                      try { const cred = await signInWithEmailAndPassword(auth, email, password); await joinFamily(cred.user.uid, cred.user.email); }
                      catch (e) { setErrorMsg(e.message); }
                    } else { setErrorMsg(error.message); }
                  } finally { signingUpRef.current = false; setLoading(false); }
                }}>
                  {loading ? 'Joining…' : <>Join Family <ArrowRight size={16}/></>}
                </button>
                <button className="btn btn-ghost w-full" onClick={() => setJoinFamilyMode(false)}>Create a new family instead</button>
              </>
            ) : (
              <>
                <input type="text" placeholder="Family name (e.g., Smith Family)" value={familyName} onChange={(e) => setFamilyName(e.target.value)} className="input" disabled={loading} />
                <input type="email" placeholder="Your email (parent)" value={email} onChange={(e) => setEmail(e.target.value)} className="input" disabled={loading} />
                <input type="password" placeholder="Password (min 6 characters)" value={password} onChange={(e) => setPassword(e.target.value)} className="input" disabled={loading} />
                {errorMsg && <p className="error-msg">{errorMsg}</p>}
                <button className="btn btn-primary" onClick={signUp} disabled={loading}>
                  {loading ? 'Creating…' : <>Create Account <ArrowRight size={16}/></>}
                </button>
                <p className="text-center text-sm text-muted">Your family gets a unique code to share with a second parent.</p>
                <button className="btn btn-ghost w-full" onClick={() => setJoinFamilyMode(true)}>Join an existing family instead</button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // FAMILY HOME SCREEN
  if (screen === 'family-home' && familyData && currentUser) {
    return (
      <div className="screen">
        <div className="container-sm home-wrap">
          <div className="home-logo-wrap">
            <MascotSVG className="home-mascot" />
            <p className="home-family-name">{familyData.name}</p>
          </div>

          {familyData.children && Object.keys(familyData.children).length > 0 ? (
            <>
              <p className="home-who-label">Who are you?</p>
              <div className="home-children">
                {Object.values(familyData.children).map(child => (
                  <button key={child.id} className="btn-child" onClick={() => {
                    if (child.pin) { setPendingChildId(child.id); setChildPinAttempt(''); setChildPinError(''); setScreen('childPin'); }
                    else { setCurrentChildId(child.id); setScreen('child'); }
                  }}>
                    {child.name}{child.pin ? ' 🔒' : ''}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-center text-muted text-sm mb-4">Parents: add children to get started!</p>
          )}

          <div className="home-parent-zone">
            <button className="btn btn-secondary" onClick={() => setScreen('parentPin')}>👤 Parent Access</button>
            <button className="btn btn-ghost w-full flex items-center justify-center gap-2" onClick={logout} style={{color:'var(--red)'}}>
              <LogOut size={15}/> Logout
            </button>
            {currentUser?.uid === ADMIN_UID && (
              <button className="btn btn-ghost w-full" onClick={() => setScreen('admin')} style={{fontSize:'0.75rem'}}>⚙️ Admin</button>
            )}
            <p className="home-version">v{APP_VERSION}</p>
          </div>
        </div>
      </div>
    );
  }

  // CHILD PIN SCREEN
  if (screen === 'childPin' && pendingChildId && familyData) {
    const child = familyData.children?.[pendingChildId];
    return (
      <div className="screen">
        <div className="container-sm pin-screen-wrap">
          <div className="pin-avatar">
            <MascotSVG className="auth-mascot" />
            <p className="pin-name">{child?.name}</p>
            <p className="pin-sub">Enter your PIN</p>
          </div>
          <div className="card space-y-3">
            {isLockedOut(`childPin_${pendingChildId}`) && (
              <div className="pin-lockout">
                <p>🔒 Too many attempts</p>
                <span>Try again in {isLockedOut(`childPin_${pendingChildId}`)} seconds</span>
              </div>
            )}
            <input type="password" inputMode="numeric" placeholder="••••" value={childPinAttempt} autoFocus
              disabled={!!isLockedOut(`childPin_${pendingChildId}`)}
              className="input input--pin"
              maxLength="6"
              onChange={(e) => {
                if (isLockedOut(`childPin_${pendingChildId}`)) return;
                const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                setChildPinAttempt(val); setChildPinError('');
                if (val.length >= 4) {
                  setTimeout(async () => {
                    let match = false;
                    if (child?.pinHashed) { const hashed = await hashPin(val); match = hashed === child.pin; }
                    else { match = val === child?.pin; }
                    const childLockKey = `childPin_${pendingChildId}`;
                    if (match) { clearAttempts(childLockKey); setCurrentChildId(pendingChildId); setPendingChildId(null); setChildPinAttempt(''); setScreen('child'); }
                    else if (val.length >= 4) {
                      const count = recordFailedAttempt(childLockKey); const newLock = isLockedOut(childLockKey);
                      setChildPinError(newLock ? `Too many attempts. Locked for ${newLock}s.` : `Incorrect PIN (${count} attempt${count > 1 ? 's' : ''}).`);
                      setChildPinAttempt('');
                    }
                  }, 100);
                }
              }}
            />
            {childPinError && <p className="error-msg text-center">{childPinError}</p>}
            <button className="btn btn-ghost w-full" onClick={() => { setPendingChildId(null); setChildPinAttempt(''); setScreen('family-home'); }}>← Back</button>
          </div>
        </div>
      </div>
    );
  }

  // PARENT PIN SCREEN
  if (screen === 'parentPin') {
    if (settingPin) {
      return (
        <div className="screen">
          <div className="container-sm pin-screen-wrap">
            <div className="pin-avatar">
              <p className="pin-name">Set Parent PIN</p>
              <p className="pin-sub">4–6 digit security code</p>
            </div>
            <div className="card space-y-3">
              <input type="password" inputMode="numeric" placeholder="••••" value={parentPin} className="input input--pin"
                onChange={(e) => { const val = e.target.value.replace(/\D/g, '').slice(0, 4); setParentPin(val); if (val.length === 4) setTimeout(() => saveParentPin(), 100); }}
                maxLength="4" />
              {errorMsg && <p className="error-msg">{errorMsg}</p>}
              <button className="btn btn-primary" onClick={saveParentPin}>Set PIN</button>
              <button className="btn btn-ghost w-full" onClick={() => { setSettingPin(false); setParentPin(''); setErrorMsg(''); }}>Skip for now</button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="screen">
        <div className="container-sm pin-screen-wrap">
          <div className="pin-avatar">
            <p className="pin-name">Parent Access</p>
            <p className="pin-sub">Enter your PIN</p>
          </div>
          <div className="card space-y-3">
            {!familyData?.parentPin ? (
              <>
                <p className="text-center text-muted text-sm">No PIN set. Set one now.</p>
                <button className="btn btn-primary" onClick={() => setSettingPin(true)}>Set PIN Now</button>
              </>
            ) : (
              <>
                {isPinLocked() && (
                  <div className="pin-lockout">
                    <p>🔒 Too many attempts</p>
                    <span>Try again in {lockCountdown} seconds</span>
                  </div>
                )}
                <input type="password" inputMode="numeric" placeholder="••••" value={pinAttempt}
                  disabled={isPinLocked()} className="input input--pin" maxLength="4" autoFocus
                  onChange={(e) => {
                    if (isPinLocked()) return;
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6); setPinAttempt(val);
                    if (val.length >= 4) {
                      setTimeout(async () => {
                        if (!familyData.pinHashed) {
                          if (val === familyData.parentPin) { setScreen('parent'); setPinAttempt(''); setErrorMsg('⚠️ Please reset your PIN for improved security.'); }
                          else { setErrorMsg('Incorrect PIN'); setPinAttempt(''); }
                          return;
                        }
                        const hashed = await hashPin(val);
                        if (hashed === familyData.parentPin) { setScreen('parent'); setPinAttempt(''); setErrorMsg(''); setPinFailCount(0); }
                        else {
                          recordPinFailure();
                          setErrorMsg(pinFailCount + 1 >= PIN_MAX_ATTEMPTS ? `Too many attempts. Locked for ${PIN_LOCKOUT_SECONDS}s.` : `Incorrect PIN (${PIN_MAX_ATTEMPTS - pinFailCount - 1} attempts remaining)`);
                          setPinAttempt('');
                        }
                      }, 100);
                    }
                  }}
                />
                {errorMsg && <p className="error-msg text-center">{errorMsg}</p>}
                <div className="pin-forgot-wrap">
                  {!pinBypassMode ? (
                    <button className="pin-forgot-btn" onClick={() => { setPinBypassMode(true); setPinBypassError(''); setPinBypassPassword(''); }}>Forgot PIN?</button>
                  ) : (
                    <div className="pin-bypass-card">
                      <p>Enter your account password to reset your PIN</p>
                      <input type="password" placeholder="Account password" value={pinBypassPassword} className="input"
                        onChange={(e) => { setPinBypassPassword(e.target.value); setPinBypassError(''); }}
                        onKeyPress={(e) => e.key === 'Enter' && bypassPinWithPassword()} autoFocus />
                      {pinBypassError && <p className="error-msg">{pinBypassError}</p>}
                      <button className="btn btn-teal" onClick={bypassPinWithPassword} disabled={loading}>{loading ? 'Verifying…' : 'Verify & Reset PIN'}</button>
                      <button className="btn btn-ghost w-full" onClick={() => { setPinBypassMode(false); setPinBypassPassword(''); setPinBypassError(''); }}>Cancel</button>
                    </div>
                  )}
                </div>
              </>
            )}
            <button className="btn btn-ghost w-full" onClick={() => { setScreen('family-home'); setPinBypassMode(false); setPinBypassPassword(''); setPinBypassError(''); }}>← Back</button>
          </div>
        </div>
      </div>
    );
  }

  // PARENT SCREEN
  if (screen === 'parent' && familyData) {
    return (
      <div className="screen">
        <div className="container-lg">
          <div className="parent-header">
            <div>
              <p className="parent-header-title">{familyData.name}</p>
              <p className="parent-header-sub">Parent Dashboard</p>
            </div>
            <button className="btn btn-back" onClick={() => setScreen('family-home')}>← Back</button>
          </div>

          {familyData?.parentPin && !familyData?.pinHashed && (
            <div className="warning-banner">
              <p>⚠️ Your PIN needs a security upgrade.</p>
              <button className="btn" onClick={() => { setSettingPin(true); setScreen('parentPin'); }}>Reset PIN</button>
            </div>
          )}

          {/* Earnings Summary */}
          <div className="earnings-grid">
            {familyData.children && Object.values(familyData.children).map(child => {
              const earnings = calculateChildEarnings(child.id);
              const completedCount = familyData.childTasks ? Object.values(familyData.childTasks).filter(t => t.completed?.includes(child.id)).length : 0;
              return (
                <div key={child.id} className="earnings-card" onClick={() => setPayslipChild(child)}>
                  <p className="earnings-week-label">This Week</p>
                  <p className="earnings-amount">{formatReward(earnings)}</p>
                  <p className="earnings-name">{child.name}</p>
                  <p className="earnings-count">{completedCount} chore{completedCount !== 1 ? 's' : ''} · tap for payslip</p>
                </div>
              );
            })}
          </div>

          {/* Payslip Modal */}
          {payslipChild && (() => {
            const child = payslipChild;
            const completedTasks = familyData.childTasks ? Object.values(familyData.childTasks).filter(t => t.completed?.includes(child.id)) : [];
            const total = completedTasks.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
            const byDay = {};
            completedTasks.forEach(task => { const d = task.dayOfWeek ?? 'other'; if (!byDay[d]) byDay[d] = []; byDay[d].push(task); });
            const pd2 = familyData.payday != null ? familyData.payday : 5;
            const wsd2 = (pd2 + 1) % 7;
            const sortedDayKeys = Object.keys(byDay).sort((a, b) => { const order = d => d === 'other' ? 99 : (Number(d) - wsd2 + 7) % 7; return order(a) - order(b); });
            const today = new Date(); const todayDow = today.getDay();
            const pd = familyData.payday != null ? familyData.payday : 5; const wsd = (pd + 1) % 7;
            const daysBack = (todayDow - wsd + 7) % 7;
            const weekStartDate = new Date(today); weekStartDate.setDate(today.getDate() - daysBack);
            const weekEndDate = new Date(weekStartDate); weekEndDate.setDate(weekStartDate.getDate() + 6);
            const fmt = d => d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
            const weekLabel = `${fmt(weekStartDate)} – ${fmt(weekEndDate)}`;
            return (
              <div className="modal-overlay" onClick={() => setPayslipChild(null)}>
                <div className="modal-sheet" onClick={e => e.stopPropagation()}>
                  <div className="modal-sticky-top">
                    <button className="btn-ghost" onClick={() => setPayslipChild(null)}>← Back</button>
                  </div>
                  <div className="payslip-header">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="payslip-header-sub">Weekly Payslip · {isPoints() ? 'Points' : 'Dollars'}</p>
                        <p className="payslip-header-name">{child.name}</p>
                        <p className="payslip-header-week">{weekLabel}</p>
                      </div>
                      <button className="btn-ghost" style={{color:'rgba(255,255,255,0.6)',fontSize:'1.3rem'}} onClick={() => setPayslipChild(null)}>×</button>
                    </div>
                    <div className="payslip-total-box">
                      <p className="payslip-total-label">Total {isPoints() ? 'Points' : ''} Earned</p>
                      <p className="payslip-total-value">{formatReward(total)}</p>
                      {isPoints() && <p style={{fontSize:'0.75rem',opacity:0.7,marginTop:'0.2rem'}}>= ${total.toFixed(2)} ({pointsPerDollar()} pts = $1)</p>}
                    </div>
                  </div>
                  <div className="payslip-body">
                    {completedTasks.length === 0 ? (
                      <p className="text-center text-muted text-sm" style={{padding:'1rem 0'}}>No chores completed this week.</p>
                    ) : (
                      <>
                        {sortedDayKeys.map(dayKey => (
                          <div key={dayKey}>
                            <p className="payslip-day-label">{dayKey === 'other' ? 'Other' : dayNames[Number(dayKey)]}</p>
                            {byDay[dayKey].map(task => (
                              <div key={task.id} className="payslip-row">
                                <span className="payslip-row-title"><CheckCircle2 size={15} style={{color:'var(--lime)',flexShrink:0}}/>{task.title}</span>
                                <span className="payslip-row-amount">{formatReward(task.amount)}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                        <div className="payslip-total-row"><span>Total</span><span>{formatReward(total)}</span></div>
                      </>
                    )}
                    <div className="space-y-2 mt-4">
                      <button className="btn btn-secondary" onClick={() => {
                        const printWindow = window.open('', '_blank');
                        const ppd = pointsPerDollar(); const pts = isPoints();
                        const fmtAmt = (amt) => pts ? `${Math.round(parseFloat(amt||0) * ppd)} pts` : `$${parseFloat(amt||0).toFixed(2)}`;
                        const rows = completedTasks.length === 0
                          ? '<tr><td colspan="2" style="text-align:center;color:#888;padding:16px;">No chores completed this week.</td></tr>'
                          : sortedDayKeys.map(dayKey => {
                              const dayLabel = dayKey === 'other' ? 'Other' : ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][Number(dayKey)];
                              const dayRows = byDay[dayKey].map(t => `<tr><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">✓ ${t.title}</td><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;color:#16a34a;font-weight:bold;">${fmtAmt(t.amount)}</td></tr>`).join('');
                              return `<tr><td colspan="2" style="padding:10px 12px 4px;font-size:11px;font-weight:bold;color:#888;text-transform:uppercase;letter-spacing:0.05em;background:#f9f9f9;">${dayLabel}</td></tr>${dayRows}`;
                            }).join('');
                        const conversionNote = pts ? `<p style="font-size:12px;opacity:0.75;margin:4px 0 0;">${ppd} pts = $1.00 · Total value: $${total.toFixed(2)}</p>` : '';
                        printWindow.document.write(`<!DOCTYPE html><html><head><title>Payslip – ${child.name}</title><style>body{font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:32px;color:#111}.header{background:linear-gradient(135deg,#c8ff47,#00e5c8);color:#0d0d14;border-radius:16px;padding:24px 28px;margin-bottom:24px}.header h1{margin:0 0 4px;font-size:22px}.header .week{margin:0;font-size:13px;opacity:0.7}.header .total-label{margin:16px 0 4px;font-size:12px;opacity:0.65}.header .total{margin:0;font-size:36px;font-weight:bold}table{width:100%;border-collapse:collapse;font-size:14px}.total-row td{padding:12px;font-weight:bold;font-size:16px;border-top:2px solid #e5e7eb}.total-row td:last-child{text-align:right;color:#0d0d14;font-size:18px}.footer{margin-top:32px;font-size:11px;color:#aaa;text-align:center}@media print{body{padding:16px}}</style></head><body><div class="header"><p class="week">Weekly Payslip · ${weekLabel}</p><h1>${child.name}</h1><p class="total-label">Total Earned</p><p class="total">${fmtAmt(total)}</p>${conversionNote}</div><table>${rows}<tr class="total-row"><td>Total</td><td>${fmtAmt(total)}</td></tr></table><p class="footer">Generated by ChoreChain · ${new Date().toLocaleDateString('en-NZ', {day:'numeric',month:'long',year:'numeric'})}</p></body></html>`);
                        printWindow.document.close(); printWindow.focus(); setTimeout(() => printWindow.print(), 400);
                      }}>🖨️ Print Payslip</button>
                      <button className="btn btn-teal" onClick={() => {
                        const ppd2 = pointsPerDollar(); const pts2 = isPoints();
                        const fmtCsv = (amt) => pts2 ? `${Math.round(parseFloat(amt||0) * ppd2)} pts` : `$${parseFloat(amt||0).toFixed(2)}`;
                        const rows = [['ChoreChain Weekly Payslip'],[`Child: ${child.name}`],[`Week: ${weekLabel}`],[`Reward Mode: ${pts2 ? `Points (${ppd2} pts = $1)` : 'Dollars'}`],[],['Day', 'Chore', pts2 ? 'Points' : 'Amount', pts2 ? 'Value ($)' : ''],...completedTasks.map(t => [t.dayOfWeek != null ? ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][t.dayOfWeek] : 'Other', t.title, fmtCsv(t.amount), pts2 ? `$${parseFloat(t.amount||0).toFixed(2)}` : '']),[], ['', 'Total', fmtCsv(total), pts2 ? `$${total.toFixed(2)}` : '']];
                        const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
                        const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob);
                        const a = document.createElement('a'); a.href = url; a.download = `payslip-${child.name.toLowerCase().replace(/\s+/g,'-')}-${weekLabel.replace(/[^a-z0-9]/gi,'-')}.csv`; a.click(); URL.revokeObjectURL(url);
                      }}>📥 Download CSV</button>
                      <button className="btn btn-secondary" onClick={() => setPayslipChild(null)}>Close</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Task Creation */}
          <div className="dash-section">
            <p className="dash-section-title">{editingTemplate ? 'Edit Task' : 'Create Task'}</p>
            <div className="space-y-3 mt-4">
              <input type="text" placeholder="Task title (e.g., Empty dishwasher)"
                value={editingTemplate ? editingTemplate.title : newTemplate.title}
                onChange={(e) => editingTemplate ? setEditingTemplate({...editingTemplate, title: e.target.value}) : setNewTemplate({...newTemplate, title: e.target.value})}
                className="input" />
              <div>
                <label className="field-label">Amount <span style={{color:'var(--lime)',textTransform:'none',letterSpacing:'normal'}}>· always entered in dollars $</span></label>
                <div className="input--prefix-wrap">
                  <span className="input--prefix">$</span>
                  <input type="number" placeholder="0.00" step="0.50" min="0"
                    value={editingTemplate ? editingTemplate.amount : newTemplate.amount}
                    onChange={(e) => editingTemplate ? setEditingTemplate({...editingTemplate, amount: e.target.value}) : setNewTemplate({...newTemplate, amount: e.target.value})}
                    className="input" />
                </div>
                {isPoints() && <p className="text-xs text-muted mt-1">= {Math.round(parseFloat((editingTemplate ? editingTemplate.amount : newTemplate.amount) || 0) * pointsPerDollar())} pts at current rate ({pointsPerDollar()} pts/$1)</p>}
              </div>
              <div>
                <label className="field-label">Frequency</label>
                <div className="space-y-2">
                  {['once', 'daily', 'weekly', 'specific'].map(freq => (
                    <label key={freq} className="radio-label">
                      <input type="radio" name="frequency" value={freq}
                        checked={(editingTemplate ? editingTemplate.frequency : newTemplate.frequency) === freq}
                        onChange={(e) => editingTemplate ? setEditingTemplate({...editingTemplate, frequency: e.target.value}) : setNewTemplate({...newTemplate, frequency: e.target.value})} />
                      <span style={{textTransform:'capitalize'}}>{freq === 'specific' ? 'Specific Days' : freq}</span>
                    </label>
                  ))}
                </div>
              </div>
              {(editingTemplate ? editingTemplate.frequency : newTemplate.frequency) === 'weekly' && (
                <div>
                  <label className="field-label">Day of Week</label>
                  <select className="select"
                    value={editingTemplate ? editingTemplate.dayOfWeek : newTemplate.dayOfWeek}
                    onChange={(e) => editingTemplate ? setEditingTemplate({...editingTemplate, dayOfWeek: parseInt(e.target.value)}) : setNewTemplate({...newTemplate, dayOfWeek: parseInt(e.target.value)})}>
                    {dayNames.map((day, idx) => <option key={idx} value={idx}>{day}</option>)}
                  </select>
                </div>
              )}
              {(editingTemplate ? editingTemplate.frequency : newTemplate.frequency) === 'specific' && (
                <div>
                  <label className="field-label">Select Days</label>
                  <div className="grid-4">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
                      <button key={idx} onClick={() => {
                        const days = editingTemplate ? editingTemplate.specificDays : newTemplate.specificDays;
                        const newDays = days.includes(idx) ? days.filter(d => d !== idx) : [...days, idx];
                        editingTemplate ? setEditingTemplate({...editingTemplate, specificDays: newDays}) : setNewTemplate({...newTemplate, specificDays: newDays});
                      }} className={(editingTemplate ? editingTemplate.specificDays : newTemplate.specificDays).includes(idx) ? 'day-pill day-pill--active' : 'day-pill'}>{day}</button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="field-label">Assign To</label>
                <select className="select"
                  value={editingTemplate ? editingTemplate.assignType : newTemplate.assignType}
                  onChange={(e) => editingTemplate ? setEditingTemplate({...editingTemplate, assignType: e.target.value}) : setNewTemplate({...newTemplate, assignType: e.target.value})}>
                  <option value="any">Any Child (voluntary)</option>
                  <option value="assigned">Specific Child</option>
                  <option value="rotate">Rotate Between Children</option>
                </select>
              </div>
              {(editingTemplate ? editingTemplate.assignType : newTemplate.assignType) === 'assigned' && (
                <select className="select"
                  value={editingTemplate ? (editingTemplate.assignedChild || '') : (newTemplate.assignedChild || '')}
                  onChange={(e) => editingTemplate ? setEditingTemplate({...editingTemplate, assignedChild: e.target.value}) : setNewTemplate({...newTemplate, assignedChild: e.target.value})}>
                  <option value="">Select child</option>
                  {familyData.children && Object.values(familyData.children).map(child => <option key={child.id} value={child.id}>{child.name}</option>)}
                </select>
              )}
              {(editingTemplate ? editingTemplate.assignType : newTemplate.assignType) === 'rotate' && (
                <div>
                  <label className="field-label">Children to Rotate</label>
                  <div className="space-y-2">
                    {familyData.children && Object.values(familyData.children).map(child => (
                      <label key={child.id} className="checkbox-label">
                        <input type="checkbox"
                          checked={(editingTemplate ? editingTemplate.rotateChildren : newTemplate.rotateChildren).includes(child.id)}
                          onChange={(e) => {
                            const children = editingTemplate ? editingTemplate.rotateChildren : newTemplate.rotateChildren;
                            const newChildren = e.target.checked ? [...children, child.id] : children.filter(id => id !== child.id);
                            editingTemplate ? setEditingTemplate({...editingTemplate, rotateChildren: newChildren}) : setNewTemplate({...newTemplate, rotateChildren: newChildren});
                          }} />
                        {child.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {errorMsg && <p className="error-msg">{errorMsg}</p>}
              <button className="btn btn-primary" onClick={createTaskTemplate}>
                <Plus size={18}/> {editingTemplate ? 'Update Template' : 'Create Template'}
              </button>
              {editingTemplate && <button className="btn btn-secondary" onClick={() => setEditingTemplate(null)}>Cancel</button>}
            </div>
          </div>

          {/* Task Templates */}
          <div className="dash-section">
            <p className="dash-section-title">Task Templates</p>
            <div className="mt-4">
              {!familyData.taskTemplates || Object.keys(familyData.taskTemplates).length === 0 ? (
                <p className="text-muted text-sm">No task templates yet</p>
              ) : Object.values(familyData.taskTemplates).map(template => (
                <div key={template.id} className="template-item">
                  <div className="flex-1">
                    <p className="template-title">{template.title}</p>
                    <p className="template-meta">
                      {template.frequency === 'once' && 'One time'}
                      {template.frequency === 'daily' && 'Daily'}
                      {template.frequency === 'weekly' && `Weekly on ${dayNames[template.dayOfWeek]}`}
                      {template.frequency === 'specific' && 'Specific days'}
                      {template.assignType === 'assigned' && ` · ${familyData.children?.[template.assignedChild]?.name}`}
                      {template.assignType === 'rotate' && ' · Rotating'}
                      {template.assignType === 'any' && ' · Voluntary'}
                    </p>
                    <p className="template-reward">{formatReward(template.amount)}</p>
                  </div>
                  <div className="template-actions">
                    <button className="btn-icon btn-icon--edit" onClick={() => setEditingTemplate(template)}><Edit2 size={17}/></button>
                    <button className="btn-icon btn-icon--danger" onClick={() => deleteTaskTemplate(template.id)}><Trash2 size={17}/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Children + Payout */}
          <div className="grid-2-md mb-4">
            <div className="dash-section" style={{margin:0}}>
              <p className="dash-section-title">Manage Children</p>
              <div className="mt-3">
                {familyData.children && Object.values(familyData.children).map(child => (
                  <div key={child.id} className="child-item">
                    <div>
                      <p className="child-item-name">{child.name}</p>
                      <p className="child-item-pin">{child.pin ? (child.pinHashed ? '🔒 PIN set' : '⚠️ Unhashed PIN') : '🔓 No PIN'}</p>
                    </div>
                    <button className="btn btn-purple" style={{width:'auto',padding:'0.35rem 0.75rem',fontSize:'0.78rem'}} onClick={() => setManagingPinFor(child)}>
                      {child.pin ? 'Reset PIN' : 'Set PIN'}
                    </button>
                  </div>
                ))}
              </div>
              {managingPinFor && <ChildPinModal child={managingPinFor} onSave={saveChildPin} onClear={clearChildPin} onClose={() => setManagingPinFor(null)} />}
              <input type="text" placeholder="New child name" value={childName} onChange={(e) => setChildName(e.target.value)} className="input mt-3 mb-2" />
              <button className="btn btn-primary" onClick={addChildToFamily}>Add Child</button>
            </div>

            <div className="dash-section" style={{margin:0,background:'rgba(200,255,71,0.04)',borderColor:'rgba(200,255,71,0.12)'}}>
              <p className="dash-section-title">Weekly Payout</p>
              <p className="dash-section-sub">Process earnings for all children</p>
              <div className="mb-3">
                <label className="field-label">Reward Type</label>
                <div className="reward-toggle">
                  {['dollars','points'].map(mode => (
                    <button key={mode} onClick={() => saveRewardMode(mode)} className={(familyData.rewardMode || 'dollars') === mode ? 'reward-btn reward-btn--active' : 'reward-btn'}>
                      {mode === 'dollars' ? '💵 Dollars' : '⭐ Points'}
                    </button>
                  ))}
                </div>
              </div>
              {isPoints() && (
                <div className="mb-3" style={{background:'var(--bg2)',borderRadius:'var(--radius-sm)',padding:'0.75rem',border:'1px solid var(--border)'}}>
                  <label className="field-label">Points per $1</label>
                  <input type="number" min="1" step="10" defaultValue={familyData.pointsPerDollar || 100}
                    onBlur={(e) => savePointsPerDollar(e.target.value)} className="input" />
                  <p className="text-xs text-muted mt-1">e.g. a $1 chore = {familyData.pointsPerDollar || 100} pts</p>
                </div>
              )}
              <div className="mb-3">
                <label className="field-label">Payday</label>
                <select className="select" value={familyData.payday != null ? familyData.payday : 5} onChange={(e) => savePayday(parseInt(e.target.value))}>
                  {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
                <p className="text-xs text-muted mt-1">Chore week: {(() => { const pd = familyData.payday != null ? familyData.payday : 5; const n = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']; return `${n[(pd+1)%7]} → ${n[pd]}`; })()}</p>
              </div>
              <button className="btn btn-primary" onClick={processWeeklyPayout}><TrendingUp size={18}/> Process Payout</button>
            </div>
          </div>

          {/* Security */}
          <div className="dash-section mb-4">
            <p className="dash-section-title">Security</p>
            <p className="dash-section-sub">Manage your parent PIN and family access</p>
            <div className="family-code-box">
              <p className="family-code-label">Family Code</p>
              <p className="family-code-value">{familyId}</p>
              <p className="family-code-hint">Share this with a second parent so they can join your family. Keep it private.</p>
              <button className="btn btn-teal" onClick={() => {
                const link = `${window.location.origin}/join/${familyId}`;
                if (navigator.share) { navigator.share({ title: 'Join our family on ChoreChain', url: link }); }
                else { navigator.clipboard.writeText(link); alert('Invite link copied!'); }
              }}>🔗 Share Invite Link</button>
            </div>
            {!changePinMode ? (
              <button className="btn btn-secondary mb-3" onClick={() => setChangePinMode(true)}>🔑 Change PIN</button>
            ) : (
              <div className="space-y-3 mb-3">
                <p className="text-sm text-muted text-center">Enter a new PIN (4–6 digits)</p>
                <input type="password" inputMode="numeric" placeholder="New PIN" value={parentPin} maxLength="6"
                  className="input input--pin"
                  onChange={(e) => { const val = e.target.value.replace(/\D/g, '').slice(0, 6); setParentPin(val); setErrorMsg(''); }}
                  autoFocus />
                {errorMsg && <p className="error-msg text-center">{errorMsg}</p>}
                <button className="btn btn-primary" onClick={async () => {
                  if (parentPin.length < 4) { setErrorMsg('PIN must be at least 4 digits'); return; }
                  try {
                    const hashed = await hashPin(parentPin);
                    await set(ref(database, `families/${familyId}/parentPin`), hashed);
                    await set(ref(database, `families/${familyId}/pinHashed`), true);
                    setParentPin(''); setChangePinMode(false); setErrorMsg('');
                  } catch { setErrorMsg('Could not save PIN. Please try again.'); }
                }}>Save New PIN</button>
                <button className="btn btn-ghost w-full" onClick={() => { setChangePinMode(false); setParentPin(''); setErrorMsg(''); }}>Cancel</button>
              </div>
            )}
            <div className="danger-zone">
              <p className="danger-label">Danger Zone</p>
              {!deleteAccountMode ? (
                <button className="btn btn-danger" onClick={() => { setDeleteAccountMode(true); setDeleteAccountPassword(''); setDeleteAccountError(''); }}>🗑 Delete Account & All Data</button>
              ) : (
                <div className="card--danger space-y-3">
                  <p className="text-center text-sm" style={{color:'var(--red)',fontWeight:600}}>⚠️ This permanently deletes your account and all family data. Cannot be undone.</p>
                  <input type="password" placeholder="Enter your password to confirm" value={deleteAccountPassword}
                    onChange={(e) => { setDeleteAccountPassword(e.target.value); setDeleteAccountError(''); }}
                    onKeyPress={(e) => e.key === 'Enter' && deleteAccount()} className="input" autoFocus />
                  {deleteAccountError && <p className="error-msg">{deleteAccountError}</p>}
                  <button className="btn btn-danger-solid" onClick={deleteAccount} disabled={loading}>{loading ? 'Deleting…' : 'Yes, Delete Everything'}</button>
                  <button className="btn btn-ghost w-full" onClick={() => { setDeleteAccountMode(false); setDeleteAccountPassword(''); setDeleteAccountError(''); }}>Cancel</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // CHILD SCREEN
  if (screen === 'child' && familyData && currentChildId) {
    const childData = familyData.children?.[currentChildId];
    const childEarnings = calculateChildEarnings(currentChildId);
    
    // Get tasks for this child grouped by day
    const childTasks = familyData.childTasks ? Object.entries(familyData.childTasks).map(([id, task]) => ({
      id,
      ...task
    })).filter(task => {
      if (task.assignType === 'assigned') {
        // Assigned/rotating: only show to the assigned child
        return task.assignedChild === currentChildId;
      }
      // Voluntary: show to everyone UNLESS already accepted by a different child
      const acceptedBy = task.accepted || [];
      const acceptedByOther = acceptedBy.length > 0 && !acceptedBy.includes(currentChildId);
      return !acceptedByOther;
    }) : [];

    // Group by day
    const tasksByDay = {};
    dayNames.forEach((_, idx) => {
      tasksByDay[idx] = childTasks.filter(task => task.dayOfWeek === idx);
    });

    // Order days starting from the day after payday (week start)
    const payday = familyData.payday != null ? familyData.payday : 5;
    const weekStartDay = (payday + 1) % 7;
    const dayOrder = Array.from({length: 7}, (_, i) => (weekStartDay + i) % 7);

    return (
      <div className="screen">
        <div className="container-md">
          <div className="child-header">
            <div>
              <p className="child-greeting">Hi, {childData?.name}! 👋</p>
              <p className="child-family-name">{familyData.name}</p>
            </div>
            <button className="btn btn-back" onClick={() => { setScreen('family-home'); setChildPayslip(false); }}>← Back</button>
          </div>

          {/* Earnings Hero Card */}
          {(() => {
            const potentialEarnings = familyData.childTasks ? Object.values(familyData.childTasks).reduce((sum, task) => {
              const isForThisChild = task.assignType === 'any' ? (task.accepted?.includes(currentChildId) || false) : task.assignedChild === currentChildId;
              if (isForThisChild) sum += parseFloat(task.amount || 0);
              return sum;
            }, 0) : 0;
            const pct = potentialEarnings > 0 ? Math.min((childEarnings / potentialEarnings) * 100, 100) : 0;
            return (
              <div className="earnings-hero">
                <p className="earnings-hero-label">This Week's {isPoints() ? 'Points' : 'Earnings'}</p>
                <p className="earnings-hero-value">{formatReward(childEarnings)}</p>
                <p className="earnings-hero-potential">of {formatReward(potentialEarnings)} potential{isPoints() && ` ($${potentialEarnings.toFixed(2)})`}</p>
                <div className="earnings-progress-track">
                  <div className="earnings-progress-fill" style={{width:`${pct}%`}}></div>
                </div>
                <p className="earnings-progress-label">{pct === 100 ? '🎉 All done!' : `${Math.round(pct)}% of potential earned`}</p>
                <button className="earnings-hero-payslip-btn" onClick={() => setChildPayslip(true)}>📄 View My Payslip</button>
              </div>
            );
          })()}

          {/* Child Payslip Modal */}
          {childPayslip && (() => {
            const completedTasks = familyData.childTasks ? Object.values(familyData.childTasks).filter(t => t.completed?.includes(currentChildId)) : [];
            const total = completedTasks.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
            return (
              <div className="modal-overlay">
                <div className="modal-sheet">
                  <div className="modal-sticky-top">
                    <button className="btn-ghost" onClick={() => setChildPayslip(false)}>← Back</button>
                  </div>
                  <div className="payslip-header">
                    <p className="payslip-header-sub">My Weekly Payslip</p>
                    <p className="payslip-header-name">{childData?.name}</p>
                    <div className="payslip-total-box">
                      <p className="payslip-total-label">Total Earned</p>
                      <p className="payslip-total-value">{formatReward(total)}</p>
                      {isPoints() && <p style={{fontSize:'0.75rem',opacity:0.7}}>= ${total.toFixed(2)}</p>}
                    </div>
                  </div>
                  <div className="payslip-body">
                    {completedTasks.length === 0
                      ? <p className="text-center text-muted text-sm" style={{padding:'1rem 0'}}>No chores completed yet this week.</p>
                      : completedTasks.map(task => (
                          <div key={task.id} className="payslip-row">
                            <span className="payslip-row-title"><CheckCircle2 size={14} style={{color:'var(--lime)',flexShrink:0}}/>{task.title}</span>
                            <span className="payslip-row-amount">{formatReward(task.amount)}</span>
                          </div>
                        ))
                    }
                    {completedTasks.length > 0 && (
                      <div className="payslip-total-row"><span>Total</span><span>{formatReward(total)}</span></div>
                    )}
                    <button className="btn btn-secondary mt-4" onClick={() => setChildPayslip(false)}>Close</button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Tasks by Day */}
          {childTasks.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state-icon">📋</p>
              <p className="empty-state-title">No tasks available</p>
              <p className="empty-state-sub">Ask your parents to create some!</p>
            </div>
          ) : (
            <div>
              {dayOrder.map(dayIdx => {
                const dayTasks = tasksByDay[dayIdx];
                if (dayTasks.length === 0) return null;
                return (
                  <div key={dayIdx}>
                    <div className="day-heading">
                      <Calendar size={14}/> {dayNames[dayIdx]}
                    </div>
                    {dayTasks.map(task => {
                      const isAccepted = task.accepted?.includes(currentChildId);
                      const isCompleted = task.completed?.includes(currentChildId);
                      const isAssigned = task.assignType === 'assigned';
                      return (
                        <div key={task.id} className={isCompleted ? 'task-card task-card--done' : isAccepted ? 'task-card task-card--accepted' : 'task-card'}>
                          <div className="task-card-inner">
                            <div className="task-card-left">
                              <div className="task-card-title-row">
                                {isCompleted && <CheckCircle2 size={18} style={{color:'var(--lime)',flexShrink:0}}/>}
                                <span className={isCompleted ? 'task-card-title task-card-title--done' : 'task-card-title'}>{task.title}</span>
                                {isAssigned && <span className="tag tag--teal">Assigned</span>}
                              </div>
                              <div className="task-card-reward">
                                {isPoints() ? <Star size={15}/> : <DollarSign size={15}/>}
                                {formatReward(task.amount)}
                              </div>
                            </div>
                            <div className="task-card-actions">
                              {task.assignType === 'any' && !isAccepted && !isCompleted && (
                                <button className="task-btn-accept" onClick={() => acceptTask(task.id)}>Accept</button>
                              )}
                              {(isAssigned || (task.assignType === 'any' && isAccepted)) && !isCompleted && (
                                <button className="task-btn-done" onClick={() => completeTask(task.id)}>Done</button>
                              )}
                              {isCompleted && (
                                <button className="task-btn-undo" onClick={() => unselectTask(task.id)}>✓ Undo</button>
                              )}
                              {task.assignType === 'any' && isAccepted && !isCompleted && (
                                <button className="task-btn-unaccept" onClick={() => unselectTask(task.id)}><X size={14}/></button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ADMIN SCREEN — only visible to admin UID
  if (screen === 'admin' && currentUser?.uid === ADMIN_UID) {
    return (
      <div className="screen admin-screen">
        <div className="container-md">
          <div className="admin-header">
            <div>
              <p className="admin-title">⚙️ Admin Panel</p>
              <p className="admin-sub">ChoreChain v{APP_VERSION}</p>
            </div>
            <button className="btn btn-back" onClick={() => { setScreen('family-home'); setAdminData(null); }}>← Back</button>
          </div>

          {!adminData ? (
            <div className="text-center" style={{paddingTop:'4rem'}}>
              <button className="btn btn-primary" style={{width:'auto',padding:'1rem 2.5rem',fontSize:'1.05rem'}}
                onClick={loadAdminData} disabled={adminLoading}>
                {adminLoading ? 'Loading…' : 'Load All Families'}
              </button>
            </div>
          ) : (
            <div>
              <p className="admin-count">{adminData.length} families in database</p>
              {adminData.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1)).map(family => {
                const isOwn = family.familyId === familyId;
                const isExpanded = expandedFamily === family.familyId;
                const emails = Object.values(family.members).map(m => m.email).join(', ');
                const adminDayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
                const taskTemplates = Object.values(family.taskTemplates);
                const childTasksList = Object.values(family.childTasks);
                const children = Object.values(family.children);
                return (
                  <div key={family.familyId} className={isOwn ? 'admin-family-card admin-family-card--own' : 'admin-family-card'}>
                    <div className="admin-family-card-header">
                      <button style={{flex:1,textAlign:'left',background:'none',border:'none',cursor:'pointer',color:'inherit',padding:0}}
                        onClick={() => setExpandedFamily(isExpanded ? null : family.familyId)}>
                        <p className="admin-family-name">
                          {family.name}
                          {isOwn && <span className="tag tag--muted" style={{fontSize:'0.65rem'}}>You</span>}
                          <span className="admin-chevron">{isExpanded ? '▲' : '▼'}</span>
                        </p>
                        <p className="admin-family-code">{family.familyId}</p>
                        <p className="admin-family-email">{emails}</p>
                        <p className="admin-family-meta">
                          {family.memberCount} parent{family.memberCount !== 1 ? 's' : ''} · {family.childCount} child{family.childCount !== 1 ? 'ren' : ''} · {family.createdAt ? new Date(family.createdAt).toLocaleDateString('en-NZ') : 'unknown'}
                        </p>
                      </button>
                      {!isOwn && (
                        deletingFamily === family.familyId ? (
                          <div className="admin-delete-wrap">
                            <p className="text-xs text-center" style={{color:'var(--red)',fontWeight:700}}>Confirm?</p>
                            <button className="btn btn-danger-solid" style={{width:'auto',padding:'0.4rem 0.9rem',fontSize:'0.8rem'}} onClick={() => adminDeleteFamily(family.familyId, family.uids)}>Yes</button>
                            <button className="btn btn-secondary" style={{width:'auto',padding:'0.4rem 0.9rem',fontSize:'0.8rem'}} onClick={() => setDeletingFamily(null)}>No</button>
                          </div>
                        ) : (
                          <button className="btn-icon btn-icon--danger" style={{fontSize:'1rem'}} onClick={() => setDeletingFamily(family.familyId)}>🗑</button>
                        )
                      )}
                    </div>

                    {isExpanded && (
                      <div className="admin-family-detail">
                        <div className="admin-detail-section">
                          <p className="admin-detail-label">Settings</p>
                          <div className="admin-detail-grid">
                            <div className="admin-stat-box"><p className="admin-stat-label">Reward</p><p className="admin-stat-value" style={{textTransform:'capitalize'}}>{family.rewardMode}</p></div>
                            <div className="admin-stat-box"><p className="admin-stat-label">Payday</p><p className="admin-stat-value">{adminDayNames[family.payday]}</p></div>
                            <div className="admin-stat-box"><p className="admin-stat-label">PIN</p><p className="admin-stat-value">{family.parentPin} {family.pinHashed ? '🔒' : '⚠️'}</p></div>
                          </div>
                        </div>

                        {children.length > 0 && (
                          <div className="admin-detail-section">
                            <p className="admin-detail-label">Children</p>
                            {children.map(child => (
                              <div key={child.id} className="admin-detail-item flex justify-between items-center">
                                <span style={{fontWeight:600}}>{child.name}</span>
                                <span className="text-xs text-muted">{child.pin ? (child.pinHashed ? '🔒 PIN set' : '⚠️ unhashed') : 'No PIN'}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {taskTemplates.length > 0 && (
                          <div className="admin-detail-section">
                            <p className="admin-detail-label">Task Templates ({taskTemplates.length})</p>
                            {taskTemplates.map(t => (
                              <div key={t.id} className="admin-detail-item flex justify-between items-center">
                                <span style={{fontWeight:600,fontSize:'0.85rem'}}>{t.title}</span>
                                <span className="text-xs text-muted">${parseFloat(t.amount||0).toFixed(2)} · {t.frequency} · {t.assignType}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {childTasksList.length > 0 && (
                          <div className="admin-detail-section">
                            <p className="admin-detail-label">This Week ({childTasksList.length} tasks)</p>
                            <div className="admin-detail-grid">
                              <div className="admin-stat-box"><p className="admin-stat-label">Total</p><p className="admin-stat-value">{childTasksList.length}</p></div>
                              <div className="admin-stat-box"><p className="admin-stat-label">Done</p><p className="admin-stat-value" style={{color:'var(--lime)'}}>{childTasksList.filter(t => t.completed?.length > 0).length}</p></div>
                              <div className="admin-stat-box"><p className="admin-stat-label">Pending</p><p className="admin-stat-value" style={{color:'var(--yellow)'}}>{childTasksList.filter(t => !t.completed?.length).length}</p></div>
                            </div>
                          </div>
                        )}

                        <div className="admin-detail-section">
                          <p className="admin-detail-label">Parent Accounts</p>
                          {Object.entries(family.members).map(([uid, m]) => (
                            <div key={uid} className="admin-detail-item">
                              <p style={{fontWeight:600,fontSize:'0.875rem'}}>{m.email}</p>
                              <p className="admin-detail-uid">{uid}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="loading-screen">
      <MascotSVG style={{width:80,height:80,filter:'drop-shadow(0 0 20px rgba(200,255,71,0.4))'}}/>
      <p className="loading-title">Loading ChoreChain…</p>
      <p className="loading-sub">Please wait</p>
    </div>
  );
};

export default FamilyChoreApp;