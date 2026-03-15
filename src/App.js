import React, { useState, useEffect } from 'react';
import './App.css';
import { Plus, DollarSign, Star, Edit2, Trash2, Calendar, LogOut, CheckCircle2, X, ArrowRight, TrendingUp } from 'lucide-react';

// Firebase imports
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, sendEmailVerification, reauthenticateWithCredential, EmailAuthProvider, deleteUser, setPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';
import { getDatabase, ref, set, get, remove, onValue } from 'firebase/database';

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

// Child PIN management modal — separate component so it can use hooks
const ChildPinModal = ({ child, onSave, onClear, onClose }) => {
  const [newPin, setNewPin] = React.useState('');
  const [confirmPin, setConfirmPin] = React.useState('');
  const [pinError, setPinError] = React.useState('');
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold text-gray-900 mb-1">{child.name}'s PIN</h3>
        <p className="text-sm text-gray-500 mb-6">{child.pin ? 'Set a new PIN or clear it' : 'Set a 4–6 digit PIN'}</p>
        <input
          type="password"
          inputMode="numeric"
          placeholder="New PIN (4–6 digits)"
          value={newPin}
          autoFocus
          onChange={(e) => { setNewPin(e.target.value.replace(/\D/g,'').slice(0,6)); setPinError(''); }}
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-center text-2xl tracking-widest font-bold focus:border-purple-500 focus:outline-none mb-3"
        />
        <input
          type="password"
          inputMode="numeric"
          placeholder="Confirm PIN"
          value={confirmPin}
          onChange={(e) => { setConfirmPin(e.target.value.replace(/\D/g,'').slice(0,6)); setPinError(''); }}
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-center text-2xl tracking-widest font-bold focus:border-purple-500 focus:outline-none mb-3"
        />
        {pinError && <p className="text-red-600 text-sm text-center mb-3">{pinError}</p>}
        <button
          onClick={() => {
            if (newPin.length < 4) { setPinError('PIN must be at least 4 digits'); return; }
            if (newPin !== confirmPin) { setPinError('PINs do not match'); return; }
            onSave(child.id, newPin);
          }}
          className="w-full bg-purple-500 text-white py-3 rounded-xl font-bold hover:bg-purple-600 transition mb-3"
        >
          Save PIN
        </button>
        {child.pin && (
          <button
            onClick={() => { if (window.confirm(`Clear PIN for ${child.name}?`)) onClear(child.id); }}
            className="w-full bg-red-100 text-red-600 py-3 rounded-xl font-bold hover:bg-red-200 transition mb-3"
          >
            🗑 Clear PIN
          </button>
        )}
        <button onClick={onClose} className="w-full text-gray-500 font-bold py-2">Cancel</button>
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
            accepted: existing.accepted || [],
            completed: existing.completed || []
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
            accepted: existing.accepted || [],
            completed: existing.completed || []
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
            accepted: existing.accepted || [],
            completed: existing.completed || []
          };
        });
      }
    });

    // Write merged tasks (updates template changes, preserves progress, no duplicates)
    const tasksRef = ref(database, `families/${fid}/childTasks`);
    await set(tasksRef, newTasks);
    await set(ref(database, `families/${fid}/lastGeneratedWeek`), weekKey);
  };

  // Re-generate tasks whenever templates change (preserves progress, applies edits)
  useEffect(() => {
    if (familyId && familyData?.taskTemplates) {
      generateWeeklyTasks(familyId, familyData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, JSON.stringify(familyData?.taskTemplates)]);

  // Accept task
  const acceptTask = async (taskId) => {
    try {
      const taskRef = ref(database, `families/${familyId}/childTasks/${taskId}`);
      const snapshot = await get(taskRef);
      const task = snapshot.val() || {};
      const accepted = task.accepted || [];
      if (!accepted.includes(currentChildId)) {
        await set(taskRef, {
          ...task,
          accepted: [...accepted, currentChildId]
        });
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
      const completed = task.completed || [];
      if (!completed.includes(currentChildId)) {
        await set(taskRef, {
          ...task,
          completed: [...completed, currentChildId]
        });
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
      await set(taskRef, {
        ...task,
        accepted: (task.accepted || []).filter(id => id !== currentChildId),
        completed: (task.completed || []).filter(id => id !== currentChildId)
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
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-4">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700&family=DM+Sans:wght@500;700&display=swap');
          body { font-family: 'Sora', sans-serif; }
          .font-display { font-family: 'DM Sans', sans-serif; }
        `}</style>
        <div className="max-w-md mx-auto pt-20">
          <div className="text-center mb-12">
            <div className="inline-block bg-gradient-to-br from-purple-500 via-indigo-500 to-blue-500 rounded-3xl p-5 mb-6 shadow-2xl">
              <DollarSign className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-5xl font-display font-bold bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 bg-clip-text text-transparent mb-2">ChoreChain</h1>
            <p className="text-gray-600 font-light text-lg">Family tasks made fair</p>
            <p className="text-gray-400 text-xs mt-1">v{APP_VERSION}</p>
          </div>

          <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-2xl p-8 space-y-6 border border-white/20">
            <h2 className="text-2xl font-display font-bold text-gray-900">Sign In</h2>
            
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none bg-white/50 backdrop-blur-sm transition"
              disabled={loading}
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && signIn()}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none bg-white/50 backdrop-blur-sm transition"
              disabled={loading}
            />

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 accent-purple-500"
              />
              <span className="text-sm text-gray-600">Remember me</span>
            </label>

            {errorMsg && <p className="text-red-600 text-sm font-medium">{errorMsg}</p>}

            <button
              onClick={signIn}
              disabled={loading || !!isLockedOut(`login_${email}`)}
              className="w-full bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 text-white py-3 rounded-xl font-bold hover:shadow-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? 'Signing in...' : isLockedOut(`login_${email}`) ? `Locked (${isLockedOut(`login_${email}`)}s)` : <>Sign In <ArrowRight className="w-4 h-4" /></>}
            </button>

            {!forgotPasswordMode ? (
              <div className="text-center">
                <button
                  onClick={() => { setForgotPasswordMode(true); setErrorMsg(''); setResetEmailSent(false); }}
                  className="text-sm text-indigo-500 hover:text-indigo-700 font-medium"
                >
                  Forgot password?
                </button>
              </div>
            ) : (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
                <p className="text-sm text-indigo-800 font-medium">Enter your email above and we'll send a reset link.</p>
                {resetEmailSent ? (
                  <p className="text-green-700 text-sm font-bold text-center">✅ Reset email sent! Check your inbox.</p>
                ) : (
                  <button
                    onClick={sendPasswordReset}
                    disabled={loading}
                    className="w-full bg-indigo-500 text-white py-2 rounded-lg font-bold hover:bg-indigo-600 transition disabled:opacity-50 text-sm"
                  >
                    {loading ? 'Sending...' : 'Send Reset Email'}
                  </button>
                )}
                <button
                  onClick={() => { setForgotPasswordMode(false); setResetEmailSent(false); setErrorMsg(''); }}
                  className="w-full text-gray-500 text-sm font-medium hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            )}

            <div className="border-t border-gray-200 pt-4 text-center space-y-3">
              <p className="text-gray-600 text-sm">Don't have an account?</p>
              <button
                onClick={() => { setScreen('signup'); setEmail(''); setPassword(''); setErrorMsg(''); }}
                className="text-purple-600 font-bold hover:text-purple-700 text-sm block w-full"
              >
                Create a Family Account
              </button>
              <button
                onClick={() => { setScreen('signup'); setJoinFamilyMode(true); setEmail(''); setPassword(''); setErrorMsg(''); }}
                className="text-indigo-500 font-bold hover:text-indigo-700 text-sm block w-full"
              >
                Join an Existing Family
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // SIGNUP SCREEN
  if (screen === 'signup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-4">
        <div className="max-w-md mx-auto pt-20">
          <button 
            onClick={() => { setScreen('login'); setJoinFamilyMode(false); setJoinFamilyCode(''); setErrorMsg(''); }} 
            className="text-purple-600 font-bold mb-6 flex items-center gap-1"
          >
            ← Back
          </button>

          <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-2xl p-8 space-y-6 border border-white/20">
            <h2 className="text-2xl font-display font-bold text-gray-900">{joinFamilyMode ? 'Join a Family' : 'Create Family Account'}</h2>

            {joinFamilyMode ? (
              <>
                <p className="text-gray-600 text-sm">Ask the family admin for their 8-character family code.</p>
                <input
                  type="email"
                  placeholder="Your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none bg-white/50 backdrop-blur-sm transition"
                  disabled={loading}
                />
                <input
                  type="password"
                  placeholder="Password (min 6 characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none bg-white/50 backdrop-blur-sm transition"
                  disabled={loading}
                />
                <input
                  type="text"
                  placeholder="Family code (e.g. XXXXXXXX)"
                  value={joinFamilyCode}
                  onChange={(e) => setJoinFamilyCode(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none bg-white/50 backdrop-blur-sm transition font-mono tracking-widest"
                  maxLength={8}
                  disabled={loading}
                />
                {errorMsg && <p className="text-red-600 text-sm font-medium">{errorMsg}</p>}
                <button
                  onClick={async () => {
                    setErrorMsg('');
                    if (!email || !password || !joinFamilyCode) { setErrorMsg('Please fill in all fields'); return; }
                    if (password.length < 6) { setErrorMsg('Password must be at least 6 characters'); return; }
                    setLoading(true);
                    signingUpRef.current = true;
                    try {
                      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                      setCurrentUser(userCredential.user);
                      try { await sendEmailVerification(userCredential.user); } catch (_) {}
                      await joinFamily(userCredential.user.uid, userCredential.user.email);
                    } catch (error) {
                      if (error.code === 'auth/email-already-in-use') {
                        // Already has account — just sign in and join
                        try {
                          const cred = await signInWithEmailAndPassword(auth, email, password);
                          await joinFamily(cred.user.uid, cred.user.email);
                        } catch (e) { setErrorMsg(e.message); }
                      } else {
                        setErrorMsg(error.message);
                      }
                    } finally {
                      signingUpRef.current = false;
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white py-3 rounded-xl font-bold hover:shadow-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? 'Joining...' : <>Join Family <ArrowRight className="w-4 h-4" /></>}
                </button>
                <button onClick={() => setJoinFamilyMode(false)} className="w-full text-gray-500 text-sm font-medium hover:text-gray-700 text-center">
                  Create a new family instead
                </button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Family name (e.g., Smith Family)"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none bg-white/50 backdrop-blur-sm transition"
                  disabled={loading}
                />
                <input
                  type="email"
                  placeholder="Your email (parent)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none bg-white/50 backdrop-blur-sm transition"
                  disabled={loading}
                />
                <input
                  type="password"
                  placeholder="Password (min 6 characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none bg-white/50 backdrop-blur-sm transition"
                  disabled={loading}
                />
                {errorMsg && <p className="text-red-600 text-sm font-medium">{errorMsg}</p>}
                <button
                  onClick={signUp}
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 text-white py-3 rounded-xl font-bold hover:shadow-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? 'Creating...' : <>Create Account <ArrowRight className="w-4 h-4" /></>}
                </button>
                <p className="text-gray-600 text-sm text-center">
                  Your family gets a unique code to share with a second parent.
                </p>
                <button onClick={() => setJoinFamilyMode(true)} className="w-full text-indigo-500 text-sm font-medium hover:text-indigo-700 text-center">
                  Join an existing family instead
                </button>
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
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-4">
        <div className="max-w-md mx-auto pt-16">
          <div className="text-center mb-12">
            <div className="inline-block bg-gradient-to-br from-purple-500 via-indigo-500 to-blue-500 rounded-3xl p-5 mb-6 shadow-2xl">
              <DollarSign className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-4xl font-display font-bold text-gray-900 mb-2">{familyData.name}</h1>
          </div>

          <div className="space-y-4">
            <button
              onClick={() => setScreen('parentPin')}
              className="w-full bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 text-white py-4 rounded-2xl font-bold hover:shadow-lg transition text-lg shadow-lg"
            >
              👤 Parent Access
            </button>

            {familyData.children && Object.keys(familyData.children).length > 0 ? (
              <>
                <p className="text-gray-600 text-center text-sm mt-8 mb-4 font-medium">Or login as:</p>
                <div className="space-y-3">
                  {Object.values(familyData.children).map(child => (
                    <button
                      key={child.id}
                      onClick={() => {
                        if (child.pin) {
                          setPendingChildId(child.id);
                          setChildPinAttempt('');
                          setChildPinError('');
                          setScreen('childPin');
                        } else {
                          setCurrentChildId(child.id);
                          setScreen('child');
                        }
                      }}
                      className="w-full bg-gradient-to-r from-pink-400 via-purple-400 to-indigo-400 text-white py-3 rounded-2xl font-bold hover:shadow-lg transition shadow-md flex items-center justify-center gap-2"
                    >
                      👧 {child.name}{child.pin ? ' 🔒' : ''}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-gray-500 text-center text-sm mt-8">Parents: add children to get started!</p>
            )}

            <button
              onClick={logout}
              className="w-full text-red-600 font-bold hover:text-red-700 mt-8 py-2 flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
            {currentUser?.uid === ADMIN_UID && (
              <button
                onClick={() => setScreen('admin')}
                className="w-full text-gray-400 hover:text-gray-600 py-2 text-xs font-medium flex items-center justify-center gap-1 mt-1"
              >
                ⚙️ Admin
              </button>
            )}
            <p className="text-gray-400 text-xs text-center mt-4">v{APP_VERSION}</p>
          </div>
        </div>
      </div>
    );
  }

  // CHILD PIN SCREEN
  if (screen === 'childPin' && pendingChildId && familyData) {
    const child = familyData.children?.[pendingChildId];
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-50 p-4">
        <div className="max-w-md mx-auto pt-32">
          <div className="text-center mb-12">
            <div className="text-6xl mb-4">👧</div>
            <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">{child?.name}</h1>
            <p className="text-gray-600">Enter your PIN</p>
          </div>
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-2xl p-8 space-y-6 border border-white/20">
            {isLockedOut(`childPin_${pendingChildId}`) && (
              <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 text-center">
                <p className="text-red-600 font-bold">🔒 Too many attempts</p>
                <p className="text-red-500 text-sm mt-1">Try again in {isLockedOut(`childPin_${pendingChildId}`)} seconds</p>
              </div>
            )}
            <input
              type="password"
              inputMode="numeric"
              placeholder="••••"
              value={childPinAttempt}
              autoFocus
              disabled={!!isLockedOut(`childPin_${pendingChildId}`)}
              onChange={(e) => {
                if (isLockedOut(`childPin_${pendingChildId}`)) return;
                const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                setChildPinAttempt(val);
                setChildPinError('');
                if (val.length >= 4) {
                  setTimeout(async () => {
                    let match = false;
                    if (child?.pinHashed) {
                      const hashed = await hashPin(val);
                      match = hashed === child.pin;
                    } else {
                      match = val === child?.pin;
                    }
                    const childLockKey = `childPin_${pendingChildId}`;
                    if (match) {
                      clearAttempts(childLockKey);
                      setCurrentChildId(pendingChildId);
                      setPendingChildId(null);
                      setChildPinAttempt('');
                      setScreen('child');
                    } else if (val.length >= 4) {
                      const count = recordFailedAttempt(childLockKey);
                      const newLock = isLockedOut(childLockKey);
                      setChildPinError(newLock
                        ? `Too many attempts. Locked for ${newLock}s.`
                        : `Incorrect PIN (${count} attempt${count > 1 ? 's' : ''}).`);
                      setChildPinAttempt('');
                    }
                  }, 100);
                }
              }}
              maxLength="6"
              className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl text-5xl text-center font-bold tracking-widest focus:border-purple-500 focus:outline-none bg-white/50 backdrop-blur-sm transition disabled:opacity-50"
            />
            {childPinError && <p className="text-red-600 text-sm text-center font-medium">{childPinError}</p>}
            <button
              onClick={() => { setPendingChildId(null); setChildPinAttempt(''); setScreen('family-home'); }}
              className="w-full text-purple-600 font-bold hover:text-purple-700"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // PARENT PIN SCREEN
  if (screen === 'parentPin') {
    if (settingPin) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-4">
          <div className="max-w-md mx-auto pt-32">
            <div className="text-center mb-12">
              <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Set Parent PIN</h1>
              <p className="text-gray-600">4-digit security code</p>
            </div>

            <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-2xl p-8 space-y-6 border border-white/20">
              <input
                type="password"
                inputMode="numeric"
                placeholder="••••"
                value={parentPin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setParentPin(val);
                  if (val.length === 4) {
                    setTimeout(() => saveParentPin(), 100);
                  }
                }}
                maxLength="4"
                className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl text-5xl text-center font-bold tracking-widest focus:border-purple-500 focus:outline-none bg-white/50 backdrop-blur-sm transition"
              />

              {errorMsg && <p className="text-red-600 text-sm">{errorMsg}</p>}

              <button
                onClick={saveParentPin}
                className="w-full bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 text-white py-3 rounded-xl font-bold hover:shadow-lg transition"
              >
                Set PIN
              </button>

              <button
                onClick={() => { setSettingPin(false); setParentPin(''); setErrorMsg(''); }}
                className="w-full text-gray-600 font-bold hover:text-gray-700"
              >
                Skip for now
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-4">
        <div className="max-w-md mx-auto pt-32">
          <div className="text-center mb-12">
            <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Parent Access</h1>
            <p className="text-gray-600">Enter your 4-digit PIN</p>
          </div>

          <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-2xl p-8 space-y-6 border border-white/20">
            {!familyData?.parentPin ? (
              <>
                <p className="text-gray-600 text-center">No PIN set. Set one now.</p>
                <button
                  onClick={() => setSettingPin(true)}
                  className="w-full bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 text-white py-3 rounded-xl font-bold hover:shadow-lg transition"
                >
                  Set PIN Now
                </button>
              </>
            ) : (
              <>
                {isPinLocked() && (
                  <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 text-center">
                    <p className="text-red-600 font-bold">🔒 Too many attempts</p>
                    <p className="text-red-500 text-sm mt-1">Try again in {lockCountdown} seconds</p>
                  </div>
                )}
                <input
                  type="password"
                  inputMode="numeric"
                  placeholder="••••"
                  value={pinAttempt}
                  disabled={isPinLocked()}
                  onChange={(e) => {
                    if (isPinLocked()) return;
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setPinAttempt(val);
                    if (val.length >= 4) {
                      setTimeout(async () => {
                        // Detect legacy plain-text PINs and force reset
                        if (!familyData.pinHashed) {
                          if (val === familyData.parentPin) {
                            setScreen('parent');
                            setPinAttempt('');
                            setErrorMsg('⚠️ Please reset your PIN for improved security.');
                          } else {
                            setErrorMsg('Incorrect PIN');
                            setPinAttempt('');
                          }
                          return;
                        }
                        const hashed = await hashPin(val);
                        if (hashed === familyData.parentPin) {
                          setScreen('parent');
                          setPinAttempt('');
                          setErrorMsg('');
                          setPinFailCount(0);
                        } else {
                          recordPinFailure();
                          setErrorMsg(pinFailCount + 1 >= PIN_MAX_ATTEMPTS
                            ? `Too many attempts. Locked for ${PIN_LOCKOUT_SECONDS}s.`
                            : `Incorrect PIN (${PIN_MAX_ATTEMPTS - pinFailCount - 1} attempts remaining)`);
                          setPinAttempt('');
                        }
                      }, 100);
                    }
                  }}
                  maxLength="4"
                  className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl text-5xl text-center font-bold tracking-widest focus:border-purple-500 focus:outline-none bg-white/50 backdrop-blur-sm transition"
                  autoFocus
                />

                {errorMsg && <p className="text-red-600 text-sm text-center font-medium">{errorMsg}</p>}

                {/* Forgot PIN — bypass via account password */}
                {!pinBypassMode ? (
                  <div className="text-center">
                    <button
                      onClick={() => { setPinBypassMode(true); setPinBypassError(''); setPinBypassPassword(''); }}
                      className="text-sm text-indigo-500 hover:text-indigo-700 font-medium"
                    >
                      Forgot PIN?
                    </button>
                  </div>
                ) : (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
                    <p className="text-sm text-indigo-800 font-medium text-center">Enter your account password to reset your PIN</p>
                    <input
                      type="password"
                      placeholder="Account password"
                      value={pinBypassPassword}
                      onChange={(e) => { setPinBypassPassword(e.target.value); setPinBypassError(''); }}
                      onKeyPress={(e) => e.key === 'Enter' && bypassPinWithPassword()}
                      className="w-full px-4 py-3 border-2 border-indigo-200 rounded-xl focus:border-indigo-500 focus:outline-none bg-white transition"
                      autoFocus
                    />
                    {pinBypassError && <p className="text-red-600 text-sm text-center">{pinBypassError}</p>}
                    <button
                      onClick={bypassPinWithPassword}
                      disabled={loading}
                      className="w-full bg-indigo-500 text-white py-2 rounded-lg font-bold hover:bg-indigo-600 transition disabled:opacity-50 text-sm"
                    >
                      {loading ? 'Verifying...' : 'Verify & Reset PIN'}
                    </button>
                    <button
                      onClick={() => { setPinBypassMode(false); setPinBypassPassword(''); setPinBypassError(''); }}
                      className="w-full text-gray-500 text-sm font-medium hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </>
            )}

            <button
              onClick={() => { setScreen('family-home'); setPinBypassMode(false); setPinBypassPassword(''); setPinBypassError(''); }}
              className="w-full text-purple-600 font-bold hover:text-purple-700"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // PARENT SCREEN
  if (screen === 'parent' && familyData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-8 mt-6">
            <div>
              <h1 className="text-4xl font-display font-bold text-gray-900">{familyData.name}</h1>
              <p className="text-gray-600 font-light">Parent Dashboard</p>
            </div>
            <button
              onClick={() => setScreen('family-home')}
              className="flex items-center gap-2 bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition font-bold"
            >
              ← Back
            </button>
          </div>

          {/* PIN upgrade warning banner */}
          {familyData?.parentPin && !familyData?.pinHashed && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 mb-6 flex items-center justify-between gap-4">
              <p className="text-amber-800 font-medium text-sm">⚠️ Your PIN needs a security upgrade.</p>
              <button
                onClick={() => { setSettingPin(true); setScreen('parentPin'); }}
                className="bg-amber-400 hover:bg-amber-500 text-white font-bold px-4 py-2 rounded-xl text-sm whitespace-nowrap transition"
              >
                Reset PIN
              </button>
            </div>
          )}

          {/* Earnings Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {familyData.children && Object.values(familyData.children).map(child => {
              const earnings = calculateChildEarnings(child.id);
              const completedCount = familyData.childTasks
                ? Object.values(familyData.childTasks).filter(t => t.completed?.includes(child.id)).length
                : 0;
              return (
                <div
                  key={child.id}
                  onClick={() => setPayslipChild(child)}
                  className="bg-gradient-to-br from-purple-100 to-indigo-100 rounded-2xl shadow-lg p-6 border border-purple-200 cursor-pointer hover:shadow-xl hover:scale-105 transition-all"
                >
                  <p className="text-gray-600 text-sm font-medium mb-2">This Week</p>
                  <p className="text-4xl font-bold text-transparent bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text">{formatReward(earnings)}</p>
                  <p className="text-gray-900 font-bold mt-2">{child.name}</p>
                  <p className="text-gray-500 text-xs mt-1">{completedCount} chore{completedCount !== 1 ? 's' : ''} completed · tap for payslip</p>
                </div>
              );
            })}
          </div>

          {/* Payslip Modal */}
          {payslipChild && (() => {
            const child = payslipChild;
            const completedTasks = familyData.childTasks
              ? Object.values(familyData.childTasks).filter(t => t.completed?.includes(child.id))
              : [];
            const total = completedTasks.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
            // Group by day
            const byDay = {};
            completedTasks.forEach(task => {
              const d = task.dayOfWeek ?? 'other';
              if (!byDay[d]) byDay[d] = [];
              byDay[d].push(task);
            });
            const pd2 = familyData.payday != null ? familyData.payday : 5;
            const wsd2 = (pd2 + 1) % 7;
            const sortedDayKeys = Object.keys(byDay).sort((a, b) => {
              const order = d => d === 'other' ? 99 : (Number(d) - wsd2 + 7) % 7;
              return order(a) - order(b);
            });
            // Get current week label based on payday setting
            const today = new Date();
            const todayDow = today.getDay();
            const pd = familyData.payday != null ? familyData.payday : 5;
            const wsd = (pd + 1) % 7;
            const daysBack = (todayDow - wsd + 7) % 7;
            const weekStartDate = new Date(today);
            weekStartDate.setDate(today.getDate() - daysBack);
            const weekEndDate = new Date(weekStartDate);
            weekEndDate.setDate(weekStartDate.getDate() + 6);
            const fmt = d => d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
            const weekLabel = `${fmt(weekStartDate)} – ${fmt(weekEndDate)}`;
            return (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPayslipChild(null)}>
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                  {/* Sticky back button for PWA */}
                  <div className="sticky top-0 z-10 flex justify-between items-center px-6 pt-4 pb-2 bg-white rounded-t-3xl">
                    <button onClick={() => setPayslipChild(null)} className="text-purple-600 font-bold flex items-center gap-1">← Back</button>
                  </div>
                  {/* Header */}
                  <div className="bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 rounded-t-3xl p-6 text-white">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-light opacity-80 mb-1">Weekly Payslip · {isPoints() ? "Points" : "Dollars"}</p>
                        <h2 className="text-2xl font-bold">{child.name}</h2>
                        <p className="text-sm opacity-80 mt-1">{weekLabel}</p>
                      </div>
                      <button onClick={() => setPayslipChild(null)} className="text-white/70 hover:text-white text-2xl font-bold leading-none">×</button>
                    </div>
                    <div className="mt-4 bg-white/20 rounded-2xl p-4">
                      <p className="text-sm opacity-80">Total {isPoints() ? "Points" : ""} Earned</p>
                      <p className="text-4xl font-bold">{formatReward(total)}</p>
                      {isPoints() && <p className="text-sm opacity-75 mt-1">= ${total.toFixed(2)} ({pointsPerDollar()} pts = $1)</p>}
                    </div>
                  </div>
                  {/* Chores list */}
                  <div className="p-6">
                    {completedTasks.length === 0 ? (
                      <p className="text-gray-500 text-center py-4">No chores completed this week.</p>
                    ) : (
                      <div className="space-y-5">
                        {sortedDayKeys.map(dayKey => (
                          <div key={dayKey}>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                              {dayKey === 'other' ? 'Other' : dayNames[Number(dayKey)]}
                            </p>
                            <div className="space-y-2">
                              {byDay[dayKey].map(task => (
                                <div key={task.id} className="flex justify-between items-center py-2 border-b border-gray-100">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                                    <span className="text-gray-800 font-medium">{task.title}</span>
                                  </div>
                                  <span className="text-green-600 font-bold">{formatReward(task.amount)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                        {/* Total row */}
                        <div className="flex justify-between items-center pt-3 border-t-2 border-gray-200">
                          <span className="font-bold text-gray-900">Total</span>
                          <span className="text-xl font-bold text-purple-600">{formatReward(total)}</span>
                        </div>
                      </div>
                    )}
                    <div className="mt-6 space-y-3">
                      {/* Print button */}
                      <button
                        onClick={() => {
                          const printWindow = window.open('', '_blank');
                          const ppd = pointsPerDollar();
                          const pts = isPoints();
                          const fmtAmt = (amt) => pts ? `${Math.round(parseFloat(amt||0) * ppd)} pts` : `$${parseFloat(amt||0).toFixed(2)}`;
                          const rows = completedTasks.length === 0
                            ? '<tr><td colspan="2" style="text-align:center;color:#888;padding:16px;">No chores completed this week.</td></tr>'
                            : sortedDayKeys.map(dayKey => {
                                const dayLabel = dayKey === 'other' ? 'Other' : ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][Number(dayKey)];
                                const dayRows = byDay[dayKey].map(t =>
                                  `<tr><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">✓ ${t.title}</td><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;color:#16a34a;font-weight:bold;">${fmtAmt(t.amount)}</td></tr>`
                                ).join('');
                                return `<tr><td colspan="2" style="padding:10px 12px 4px;font-size:11px;font-weight:bold;color:#888;text-transform:uppercase;letter-spacing:0.05em;background:#f9f9f9;">${dayLabel}</td></tr>${dayRows}`;
                              }).join('');
                          const conversionNote = pts ? `<p style="font-size:12px;opacity:0.75;margin:4px 0 0;">${ppd} pts = $1.00 &nbsp;·&nbsp; Total value: $${total.toFixed(2)}</p>` : '';
                          printWindow.document.write(`<!DOCTYPE html><html><head><title>Payslip – ${child.name}</title><style>
                            body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 32px; color: #111; }
                            .header { background: linear-gradient(135deg, #7c3aed, #4f46e5); color: white; border-radius: 16px; padding: 24px 28px; margin-bottom: 24px; }
                            .header h1 { margin: 0 0 4px; font-size: 22px; }
                            .header .week { margin: 0; font-size: 13px; opacity: 0.8; }
                            .header .total-label { margin: 16px 0 4px; font-size: 12px; opacity: 0.75; }
                            .header .total { margin: 0; font-size: 36px; font-weight: bold; }
                            table { width: 100%; border-collapse: collapse; font-size: 14px; }
                            .total-row td { padding: 12px; font-weight: bold; font-size: 16px; border-top: 2px solid #e5e7eb; }
                            .total-row td:last-child { text-align: right; color: #7c3aed; font-size: 18px; }
                            .footer { margin-top: 32px; font-size: 11px; color: #aaa; text-align: center; }
                            @media print { body { padding: 16px; } }
                          </style></head><body>
                            <div class="header">
                              <p class="week">Weekly Payslip &nbsp;·&nbsp; ${weekLabel}</p>
                              <h1>${child.name}</h1>
                              <p class="total-label">Total Earned</p>
                              <p class="total">${fmtAmt(total)}</p>
                              ${conversionNote}
                            </div>
                            <table>${rows}
                              <tr class="total-row"><td>Total</td><td>${fmtAmt(total)}</td></tr>
                            </table>
                            <p class="footer">Generated by ChoreChain &nbsp;·&nbsp; ${new Date().toLocaleDateString('en-NZ', {day:'numeric',month:'long',year:'numeric'})}</p>
                          </body></html>`);
                          printWindow.document.close();
                          printWindow.focus();
                          setTimeout(() => printWindow.print(), 400);
                        }}
                        className="w-full bg-gradient-to-r from-indigo-500 to-blue-500 text-white py-3 rounded-xl font-bold hover:shadow-lg transition flex items-center justify-center gap-2"
                      >
                        🖨️ Print Payslip
                      </button>
                      {/* CSV download */}
                      <button
                        onClick={() => {
                          const ppd2 = pointsPerDollar();
                          const pts2 = isPoints();
                          const fmtCsv = (amt) => pts2 ? `${Math.round(parseFloat(amt||0) * ppd2)} pts` : `$${parseFloat(amt||0).toFixed(2)}`;
                          const rows = [
                            ['ChoreChain Weekly Payslip'],
                            [`Child: ${child.name}`],
                            [`Week: ${weekLabel}`],
                            [`Reward Mode: ${pts2 ? `Points (${ppd2} pts = $1)` : 'Dollars'}`],
                            [],
                            ['Day', 'Chore', pts2 ? 'Points' : 'Amount', pts2 ? 'Value ($)' : ''],
                            ...completedTasks.map(t => [
                              t.dayOfWeek != null ? ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][t.dayOfWeek] : 'Other',
                              t.title,
                              fmtCsv(t.amount),
                              pts2 ? `$${parseFloat(t.amount||0).toFixed(2)}` : ''
                            ]),
                            [],
                            ['', 'Total', fmtCsv(total), pts2 ? `$${total.toFixed(2)}` : '']
                          ];
                          const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
                          const blob = new Blob([csv], { type: 'text/csv' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `payslip-${child.name.toLowerCase().replace(/\s+/g,'-')}-${weekLabel.replace(/[^a-z0-9]/gi,'-')}.csv`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white py-3 rounded-xl font-bold hover:shadow-lg transition flex items-center justify-center gap-2"
                      >
                        📥 Download CSV
                      </button>
                      <button
                        onClick={() => setPayslipChild(null)}
                        className="w-full bg-gray-200 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-300 transition"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Task Creation */}
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-2xl p-8 mb-8 border border-white/20">
            <h2 className="text-2xl font-display font-bold text-gray-900 mb-6">Create Task</h2>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Task title (e.g., Empty dishwasher)"
                value={editingTemplate ? editingTemplate.title : newTemplate.title}
                onChange={(e) => editingTemplate ? setEditingTemplate({...editingTemplate, title: e.target.value}) : setNewTemplate({...newTemplate, title: e.target.value})}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none bg-white/50"
              />
              <div>
                <label className="block text-gray-700 font-bold mb-1">
                  Amount <span className="text-green-600">(always entered in dollars $)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                  <input
                    type="number"
                    placeholder="0.00"
                    step="0.50"
                    min="0"
                    value={editingTemplate ? editingTemplate.amount : newTemplate.amount}
                    onChange={(e) => editingTemplate ? setEditingTemplate({...editingTemplate, amount: e.target.value}) : setNewTemplate({...newTemplate, amount: e.target.value})}
                    className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none bg-white/50"
                  />
                </div>
                {isPoints() && (
                  <p className="text-xs text-indigo-500 mt-1">= {Math.round(parseFloat((editingTemplate ? editingTemplate.amount : newTemplate.amount) || 0) * pointsPerDollar())} pts at current rate ({pointsPerDollar()} pts/$1)</p>
                )}
              </div>

              <div>
                <p className="text-gray-700 font-bold mb-2">Frequency:</p>
                <div className="space-y-2">
                  {['once', 'daily', 'weekly', 'specific'].map(freq => (
                    <label key={freq} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="frequency"
                        value={freq}
                        checked={(editingTemplate ? editingTemplate.frequency : newTemplate.frequency) === freq}
                        onChange={(e) => editingTemplate ? setEditingTemplate({...editingTemplate, frequency: e.target.value}) : setNewTemplate({...newTemplate, frequency: e.target.value})}
                        className="w-4 h-4 text-purple-600"
                      />
                      <span className="capitalize font-medium">{freq === 'specific' ? 'Specific Days' : freq}</span>
                    </label>
                  ))}
                </div>
              </div>

              {(editingTemplate ? editingTemplate.frequency : newTemplate.frequency) === 'weekly' && (
                <div>
                  <p className="text-gray-700 font-bold mb-2">Day of Week:</p>
                  <select
                    value={editingTemplate ? editingTemplate.dayOfWeek : newTemplate.dayOfWeek}
                    onChange={(e) => editingTemplate ? setEditingTemplate({...editingTemplate, dayOfWeek: parseInt(e.target.value)}) : setNewTemplate({...newTemplate, dayOfWeek: parseInt(e.target.value)})}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none bg-white/50"
                  >
                    {dayNames.map((day, idx) => (
                      <option key={idx} value={idx}>{day}</option>
                    ))}
                  </select>
                </div>
              )}

              {(editingTemplate ? editingTemplate.frequency : newTemplate.frequency) === 'specific' && (
                <div>
                  <p className="text-gray-700 font-bold mb-2">Select Days:</p>
                  <div className="grid grid-cols-4 gap-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          const days = editingTemplate ? editingTemplate.specificDays : newTemplate.specificDays;
                          const newDays = days.includes(idx) ? days.filter(d => d !== idx) : [...days, idx];
                          if (editingTemplate) {
                            setEditingTemplate({...editingTemplate, specificDays: newDays});
                          } else {
                            setNewTemplate({...newTemplate, specificDays: newDays});
                          }
                        }}
                        className={`py-2 rounded-lg font-bold transition ${
                          (editingTemplate ? editingTemplate.specificDays : newTemplate.specificDays).includes(idx)
                            ? 'bg-purple-500 text-white'
                            : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-gray-700 font-bold mb-2">Assign To:</p>
                <select
                  value={editingTemplate ? editingTemplate.assignType : newTemplate.assignType}
                  onChange={(e) => editingTemplate ? setEditingTemplate({...editingTemplate, assignType: e.target.value}) : setNewTemplate({...newTemplate, assignType: e.target.value})}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none bg-white/50"
                >
                  <option value="any">Any Child (voluntary)</option>
                  <option value="assigned">Specific Child</option>
                  <option value="rotate">Rotate Between Children</option>
                </select>
              </div>

              {(editingTemplate ? editingTemplate.assignType : newTemplate.assignType) === 'assigned' && (
                <select
                  value={editingTemplate ? (editingTemplate.assignedChild || '') : (newTemplate.assignedChild || '')}
                  onChange={(e) => editingTemplate ? setEditingTemplate({...editingTemplate, assignedChild: e.target.value}) : setNewTemplate({...newTemplate, assignedChild: e.target.value})}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none bg-white/50"
                >
                  <option value="">Select child</option>
                  {familyData.children && Object.values(familyData.children).map(child => (
                    <option key={child.id} value={child.id}>{child.name}</option>
                  ))}
                </select>
              )}

              {(editingTemplate ? editingTemplate.assignType : newTemplate.assignType) === 'rotate' && (
                <div>
                  <p className="text-gray-700 font-bold mb-2">Children to Rotate:</p>
                  <div className="space-y-2">
                    {familyData.children && Object.values(familyData.children).map(child => (
                      <label key={child.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(editingTemplate ? editingTemplate.rotateChildren : newTemplate.rotateChildren).includes(child.id)}
                          onChange={(e) => {
                            const children = editingTemplate ? editingTemplate.rotateChildren : newTemplate.rotateChildren;
                            const newChildren = e.target.checked
                              ? [...children, child.id]
                              : children.filter(id => id !== child.id);
                            if (editingTemplate) {
                              setEditingTemplate({...editingTemplate, rotateChildren: newChildren});
                            } else {
                              setNewTemplate({...newTemplate, rotateChildren: newChildren});
                            }
                          }}
                          className="w-4 h-4 text-purple-600"
                        />
                        <span className="font-medium">{child.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {errorMsg && <p className="text-red-600 text-sm font-medium">{errorMsg}</p>}

              <button
                onClick={createTaskTemplate}
                className="w-full bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 text-white py-3 rounded-xl font-bold hover:shadow-lg transition flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                {editingTemplate ? 'Update Template' : 'Create Template'}
              </button>
              {editingTemplate && (
                <button
                  onClick={() => setEditingTemplate(null)}
                  className="w-full bg-gray-300 text-gray-900 py-3 rounded-xl font-bold hover:bg-gray-400 transition"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

          {/* Task Templates */}
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-2xl p-8 mb-8 border border-white/20">
            <h2 className="text-2xl font-display font-bold text-gray-900 mb-6">Task Templates</h2>
            <div className="space-y-3">
              {!familyData.taskTemplates || Object.keys(familyData.taskTemplates).length === 0 ? (
                <p className="text-gray-500">No task templates yet</p>
              ) : (
                Object.values(familyData.taskTemplates).map(template => (
                  <div key={template.id} className="border-2 border-purple-200 rounded-xl p-4 flex justify-between items-start bg-purple-50">
                    <div className="flex-1">
                      <p className="font-bold text-gray-900 text-lg">{template.title}</p>
                      <p className="text-sm text-gray-600 capitalize mt-1">
                        {template.frequency === 'once' && 'One time'}
                        {template.frequency === 'daily' && 'Daily'}
                        {template.frequency === 'weekly' && `Weekly on ${dayNames[template.dayOfWeek]}`}
                        {template.frequency === 'specific' && 'Specific days'}
                      </p>
                      {template.assignType === 'assigned' && (
                        <p className="text-sm text-gray-600">Assigned to: {familyData.children?.[template.assignedChild]?.name}</p>
                      )}
                      <p className="text-lg font-bold text-green-600 mt-2">{formatReward(template.amount)}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingTemplate(template)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => deleteTaskTemplate(template.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Children & Payout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20">
              <h2 className="text-2xl font-display font-bold text-gray-900 mb-4">Manage Children</h2>
              <div className="space-y-3 mb-4">
                {familyData.children && Object.values(familyData.children).map(child => (
                  <div key={child.id} className="p-3 bg-gradient-to-r from-purple-100 to-indigo-100 rounded-lg border border-purple-200">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-bold text-gray-900">{child.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{child.pin ? '🔒 PIN set' : '🔓 No PIN'}</p>
                      </div>
                      <button
                        onClick={() => setManagingPinFor(child)}
                        className="text-xs bg-purple-500 text-white px-3 py-1 rounded-lg font-bold hover:bg-purple-600 transition"
                      >
                        {child.pin ? 'Reset PIN' : 'Set PIN'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Child PIN management modal */}
              {managingPinFor && (
                <ChildPinModal
                  child={managingPinFor}
                  onSave={saveChildPin}
                  onClear={clearChildPin}
                  onClose={() => setManagingPinFor(null)}
                />
              )}
              <input
                type="text"
                placeholder="New child name"
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none mb-3 bg-white/50"
              />
              <button
                onClick={addChildToFamily}
                className="w-full bg-purple-500 text-white py-2 rounded-lg hover:bg-purple-600 transition font-bold"
              >
                Add Child
              </button>
            </div>

            <div className="bg-gradient-to-br from-green-100 to-emerald-100 rounded-3xl shadow-2xl p-8 border border-green-200">
              <h2 className="text-2xl font-display font-bold text-gray-900 mb-2">Weekly Payout</h2>
              <p className="text-gray-600 mb-4 font-light">Process earnings for all children</p>

              {/* Reward Mode toggle */}
              <div className="mb-4">
                <p className="text-gray-700 font-bold text-sm mb-2">Reward Type</p>
                <div className="grid grid-cols-2 gap-2">
                  {['dollars', 'points'].map(mode => (
                    <button
                      key={mode}
                      onClick={() => saveRewardMode(mode)}
                      className={`py-2 rounded-xl font-bold transition capitalize ${
                        (familyData.rewardMode || 'dollars') === mode
                          ? 'bg-green-500 text-white shadow'
                          : 'bg-white text-gray-600 border-2 border-gray-200'
                      }`}
                    >
                      {mode === 'dollars' ? '💵 Dollars' : '⭐ Points'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Points conversion rate — only shown in points mode */}
              {isPoints() && (
                <div className="mb-4 bg-white/60 rounded-xl p-3 border border-green-200">
                  <p className="text-gray-700 font-bold text-sm mb-1">Points per $1</p>
                  <input
                    type="number"
                    min="1"
                    step="10"
                    defaultValue={familyData.pointsPerDollar || 100}
                    onBlur={(e) => savePointsPerDollar(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-green-200 rounded-lg focus:border-green-500 focus:outline-none bg-white font-bold text-gray-800"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    e.g. a $1 chore = {familyData.pointsPerDollar || 100} pts
                  </p>
                </div>
              )}

              <div className="mb-4">
                <p className="text-gray-700 font-bold text-sm mb-2">Payday</p>
                <select
                  value={familyData.payday != null ? familyData.payday : 5}
                  onChange={(e) => savePayday(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border-2 border-green-200 rounded-xl focus:border-green-500 focus:outline-none bg-white/70 font-medium text-gray-800"
                >
                  {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d, i) => (
                    <option key={i} value={i}>{d}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Chore week: {(() => {
                    const pd = familyData.payday != null ? familyData.payday : 5;
                    const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                    return `${names[(pd + 1) % 7]} → ${names[pd]}`;
                  })()}
                </p>
              </div>
              <button
                onClick={processWeeklyPayout}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3 rounded-xl font-bold hover:shadow-lg transition flex items-center justify-center gap-2"
              >
                <TrendingUp className="w-5 h-5" />
                Process Payout
              </button>
            </div>

            {/* Security — Change PIN */}
            <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20">
              <h2 className="text-2xl font-display font-bold text-gray-900 mb-2">Security</h2>
              <p className="text-gray-600 font-light mb-4">Manage your parent PIN</p>

              {/* Family code — shown only to parent behind PIN */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6">
                <p className="text-sm text-indigo-700 font-bold mb-1">Family Code</p>
                <p className="font-mono text-2xl font-bold text-indigo-600 tracking-widest mb-2">{familyId}</p>
                <p className="text-xs text-indigo-500 mb-3">Share this code with a second parent so they can join your family. Keep it private.</p>
                <button
                  onClick={() => {
                    const link = `${window.location.origin}/join/${familyId}`;
                    if (navigator.share) {
                      navigator.share({ title: 'Join our family on ChoreChain', text: 'Use this link to join our ChoreChain family:', url: link });
                    } else {
                      navigator.clipboard.writeText(link);
                      alert('Invite link copied to clipboard!');
                    }
                  }}
                  className="w-full bg-indigo-500 text-white py-2 rounded-xl font-bold hover:bg-indigo-600 transition text-sm"
                >
                  🔗 Share Invite Link
                </button>
              </div>
              {!changePinMode ? (
                <button
                  onClick={() => setChangePinMode(true)}
                  className="w-full bg-gradient-to-r from-purple-500 to-indigo-500 text-white py-3 rounded-xl font-bold hover:shadow-lg transition"
                >
                  🔑 Change PIN
                </button>
              ) : (
                <div className="space-y-4">
                  <p className="text-gray-700 text-sm font-medium text-center">Enter a new PIN (4–6 digits)</p>
                  <input
                    type="password"
                    inputMode="numeric"
                    placeholder="New PIN"
                    value={parentPin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setParentPin(val);
                      setErrorMsg('');
                    }}
                    maxLength="6"
                    className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl text-3xl text-center font-bold tracking-widest focus:border-purple-500 focus:outline-none bg-white/50 transition"
                    autoFocus
                  />
                  {errorMsg && <p className="text-red-600 text-sm text-center">{errorMsg}</p>}
                  <button
                    onClick={async () => {
                      if (parentPin.length < 4) { setErrorMsg('PIN must be at least 4 digits'); return; }
                      try {
                        const hashed = await hashPin(parentPin);
                        await set(ref(database, `families/${familyId}/parentPin`), hashed);
                        await set(ref(database, `families/${familyId}/pinHashed`), true);
                        setParentPin('');
                        setChangePinMode(false);
                        setErrorMsg('');
                      } catch (error) {
                        setErrorMsg('Could not save PIN. Please try again.');
                      }
                    }}
                    className="w-full bg-purple-500 text-white py-3 rounded-xl font-bold hover:bg-purple-600 transition"
                  >
                    Save New PIN
                  </button>
                  <button
                    onClick={() => { setChangePinMode(false); setParentPin(''); setErrorMsg(''); }}
                    className="w-full text-gray-500 font-bold hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              )}

              <div className="border-t border-gray-200 pt-6 mt-2">
                <p className="text-sm text-gray-500 mb-4">Danger Zone</p>
                {!deleteAccountMode ? (
                  <button
                    onClick={() => { setDeleteAccountMode(true); setDeleteAccountPassword(''); setDeleteAccountError(''); }}
                    className="w-full bg-red-50 border-2 border-red-200 text-red-600 py-3 rounded-xl font-bold hover:bg-red-100 transition"
                  >
                    🗑 Delete Account & All Data
                  </button>
                ) : (
                  <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 space-y-3">
                    <p className="text-red-800 font-bold text-sm text-center">⚠️ This permanently deletes your account and all family data. This cannot be undone.</p>
                    <input
                      type="password"
                      placeholder="Enter your password to confirm"
                      value={deleteAccountPassword}
                      onChange={(e) => { setDeleteAccountPassword(e.target.value); setDeleteAccountError(''); }}
                      onKeyPress={(e) => e.key === 'Enter' && deleteAccount()}
                      className="w-full px-4 py-3 border-2 border-red-200 rounded-xl focus:border-red-500 focus:outline-none bg-white transition"
                      autoFocus
                    />
                    {deleteAccountError && <p className="text-red-600 text-sm text-center font-medium">{deleteAccountError}</p>}
                    <button
                      onClick={deleteAccount}
                      disabled={loading}
                      className="w-full bg-red-500 text-white py-3 rounded-xl font-bold hover:bg-red-600 transition disabled:opacity-50"
                    >
                      {loading ? 'Deleting...' : 'Yes, Delete Everything'}
                    </button>
                    <button
                      onClick={() => { setDeleteAccountMode(false); setDeleteAccountPassword(''); setDeleteAccountError(''); }}
                      className="w-full text-gray-500 font-bold hover:text-gray-700 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
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
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-8 mt-6">
            <div>
              <h1 className="text-3xl font-display font-bold text-gray-900">Hi, {childData?.name}! 👋</h1>
              <p className="text-gray-600 font-light">{familyData.name}</p>
            </div>
            <button
              onClick={() => { setScreen('family-home'); setChildPayslip(false); }}
              className="flex items-center gap-2 bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition font-bold"
            >
              ← Back
            </button>
          </div>

          {/* Earnings Card */}
          {(() => {
            // Potential = all assigned/accepted tasks not yet completed + already completed
            const potentialEarnings = familyData.childTasks ? Object.values(familyData.childTasks).reduce((sum, task) => {
              const isForThisChild = task.assignType === 'any'
                ? (task.accepted?.includes(currentChildId) || false)
                : task.assignedChild === currentChildId;
              if (isForThisChild) sum += parseFloat(task.amount || 0);
              return sum;
            }, 0) : 0;
            const pct = potentialEarnings > 0 ? Math.min((childEarnings / potentialEarnings) * 100, 100) : 0;
            return (
              <div className="bg-gradient-to-br from-green-400 via-emerald-400 to-teal-400 rounded-3xl shadow-2xl p-8 mb-8 text-white">
                <p className="text-sm font-light opacity-90 mb-2">This Week's {isPoints() ? 'Points' : 'Earnings'}</p>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-6xl font-bold">{formatReward(childEarnings)}</span>
                </div>
                <p className="text-sm font-light opacity-75 mb-5">of {formatReward(potentialEarnings)} potential{isPoints() && ` ($${potentialEarnings.toFixed(2)})`}</p>
                <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4">
                  <div className="w-full bg-white/30 rounded-full h-3 overflow-hidden mb-2">
                    <div
                      className="bg-white h-full rounded-full transition-all duration-300"
                      style={{width: `${pct}%`}}
                    ></div>
                  </div>
                  <p className="text-sm font-light opacity-90">{pct === 100 ? '🎉 All done!' : `${Math.round(pct)}% of potential earned`}</p>
                </div>
                <button
                  onClick={() => setChildPayslip(true)}
                  className="mt-4 w-full bg-white/20 hover:bg-white/30 text-white font-bold py-2 rounded-xl transition text-sm"
                >
                  📄 View My Payslip
                </button>
              </div>
            );
          })()}

          {/* Child Payslip Modal */}
          {childPayslip && (() => {
            const completedTasks = familyData.childTasks
              ? Object.values(familyData.childTasks).filter(t => t.completed?.includes(currentChildId))
              : [];
            const total = completedTasks.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
            return (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                  <div className="sticky top-0 z-10 flex justify-between items-center px-6 pt-4 pb-2 bg-white rounded-t-3xl">
                    <button onClick={() => setChildPayslip(false)} className="text-purple-600 font-bold flex items-center gap-1">← Back</button>
                  </div>
                  <div className="bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 mx-4 rounded-2xl p-6 text-white mb-4">
                    <p className="text-sm opacity-80 mb-1">My Weekly Payslip</p>
                    <h2 className="text-2xl font-bold">{childData?.name}</h2>
                    <div className="mt-3 bg-white/20 rounded-xl p-3">
                      <p className="text-sm opacity-80">Total Earned</p>
                      <p className="text-3xl font-bold">{formatReward(total)}</p>
                      {isPoints() && <p className="text-xs opacity-75 mt-1">= ${total.toFixed(2)}</p>}
                    </div>
                  </div>
                  <div className="px-6 pb-6 space-y-2">
                    {completedTasks.length === 0 ? (
                      <p className="text-gray-500 text-center py-4">No chores completed yet this week.</p>
                    ) : completedTasks.map(task => (
                      <div key={task.id} className="flex justify-between items-center py-2 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                          <span className="text-gray-800 font-medium">{task.title}</span>
                        </div>
                        <span className="text-green-600 font-bold">{formatReward(task.amount)}</span>
                      </div>
                    ))}
                    {completedTasks.length > 0 && (
                      <div className="flex justify-between items-center pt-3 border-t-2 border-gray-200">
                        <span className="font-bold text-gray-900">Total</span>
                        <span className="text-xl font-bold text-purple-600">{formatReward(total)}</span>
                      </div>
                    )}
                    <button onClick={() => setChildPayslip(false)} className="w-full bg-gray-100 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-200 transition mt-4">Close</button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Tasks by Day */}
          {childTasks.length === 0 ? (
            <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-2xl p-8 text-center border border-white/20">
              <Calendar className="w-8 h-8 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">No tasks available</p>
              <p className="text-gray-500 text-sm mt-2">Ask your parents to create some!</p>
            </div>
          ) : (
            <div className="space-y-6">
              {dayOrder.map(dayIdx => {
                const dayTasks = tasksByDay[dayIdx];
                if (dayTasks.length === 0) return null;

                return (
                  <div key={dayIdx}>
                    <h2 className="text-lg font-display font-bold text-gray-900 mb-3 flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-purple-600" />
                      {dayNames[dayIdx]}
                    </h2>
                    <div className="space-y-3">
                      {dayTasks.map(task => {
                        const isAccepted = task.accepted?.includes(currentChildId);
                        const isCompleted = task.completed?.includes(currentChildId);
                        const isAssigned = task.assignType === 'assigned';

                        return (
                          <div 
                            key={task.id} 
                            className={`rounded-2xl shadow-lg p-6 transition ${
                              isCompleted 
                                ? 'bg-green-100 border-2 border-green-300' 
                                : isAccepted
                                ? 'bg-white/70 backdrop-blur-xl border-2 border-purple-200'
                                : 'bg-white/70 backdrop-blur-xl border-2 border-gray-200'
                            }`}
                          >
                            <div className="flex justify-between items-start gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  {isCompleted && <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />}
                                  <h3 className={`text-lg font-bold ${isCompleted ? 'text-green-600 line-through' : 'text-gray-900'}`}>
                                    {task.title}
                                  </h3>
                                  {isAssigned && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold">Assigned</span>}
                                </div>
                                <div className="flex items-center gap-4 ml-9">
                                  <div className="flex items-center gap-1 text-green-600 font-bold">
                                    {isPoints()
                                      ? <Star className="w-5 h-5" />
                                      : <DollarSign className="w-5 h-5" />
                                    }
                                    {formatReward(task.amount)}
                                  </div>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                {/* Accept: voluntary only, not yet accepted/completed */}
                                {task.assignType === 'any' && !isAccepted && !isCompleted && (
                                  <button
                                    onClick={() => acceptTask(task.id)}
                                    className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-4 py-2 rounded-lg font-bold hover:shadow-lg transition whitespace-nowrap text-sm"
                                  >
                                    Accept
                                  </button>
                                )}
                                {/* Done button: assigned tasks always show it; voluntary shows after accepting */}
                                {(isAssigned || (task.assignType === 'any' && isAccepted)) && !isCompleted && (
                                  <button
                                    onClick={() => completeTask(task.id)}
                                    className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-4 py-2 rounded-lg font-bold hover:shadow-lg transition whitespace-nowrap text-sm"
                                  >
                                    Done
                                  </button>
                                )}
                                {/* Completed: show Undo button */}
                                {isCompleted && (
                                  <button
                                    onClick={() => unselectTask(task.id)}
                                    className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-700 transition whitespace-nowrap text-sm flex items-center gap-1"
                                  >
                                    ✓ Undo
                                  </button>
                                )}
                                {/* Un-accept: voluntary, accepted but not completed */}
                                {task.assignType === 'any' && isAccepted && !isCompleted && (
                                  <button
                                    onClick={() => unselectTask(task.id)}
                                    className="bg-gray-300 text-gray-900 px-3 py-2 rounded-lg font-bold hover:bg-gray-400 transition whitespace-nowrap text-sm flex items-center gap-1"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
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
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-4">
        <div className="max-w-2xl mx-auto pt-8">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-display font-bold text-white">⚙️ Admin Panel</h1>
              <p className="text-gray-400 text-sm">ChoreChain v{APP_VERSION}</p>
            </div>
            <button
              onClick={() => { setScreen('family-home'); setAdminData(null); }}
              className="bg-gray-700 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition font-bold"
            >
              ← Back
            </button>
          </div>

          {!adminData ? (
            <div className="text-center py-16">
              <button
                onClick={loadAdminData}
                disabled={adminLoading}
                className="bg-purple-500 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-purple-600 transition disabled:opacity-50"
              >
                {adminLoading ? 'Loading...' : 'Load All Families'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-gray-400 text-sm">{adminData.length} families in database</p>
              {adminData.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1)).map(family => {
                const isOwn = family.familyId === familyId;
                const isExpanded = expandedFamily === family.familyId;
                const emails = Object.values(family.members).map(m => m.email).join(', ');
                const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
                const taskTemplates = Object.values(family.taskTemplates);
                const childTasks = Object.values(family.childTasks);
                const children = Object.values(family.children);
                return (
                  <div key={family.familyId} className={`rounded-2xl border ${isOwn ? 'bg-purple-900/40 border-purple-500' : 'bg-gray-800 border-gray-700'}`}>
                    {/* Header row */}
                    <div className="flex justify-between items-start gap-4 p-5">
                      <button className="flex-1 min-w-0 text-left" onClick={() => setExpandedFamily(isExpanded ? null : family.familyId)}>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-white font-bold text-lg">{family.name}</p>
                          {isOwn && <span className="text-xs bg-purple-500 text-white px-2 py-0.5 rounded font-bold">You</span>}
                          <span className="text-gray-500 text-xs ml-auto">{isExpanded ? '▲' : '▼'}</span>
                        </div>
                        <p className="text-gray-400 text-xs font-mono mb-1">{family.familyId}</p>
                        <p className="text-gray-300 text-sm truncate">{emails}</p>
                        <p className="text-gray-500 text-xs mt-1">
                          {family.memberCount} parent{family.memberCount !== 1 ? 's' : ''} · {family.childCount} child{family.childCount !== 1 ? 'ren' : ''} · {family.createdAt ? new Date(family.createdAt).toLocaleDateString('en-NZ') : 'unknown date'}
                        </p>
                      </button>
                      {!isOwn && (
                        deletingFamily === family.familyId ? (
                          <div className="flex flex-col gap-2 flex-shrink-0">
                            <p className="text-red-400 text-xs text-center font-bold">Confirm?</p>
                            <button onClick={() => adminDeleteFamily(family.familyId, family.uids)} className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold hover:bg-red-600 transition text-sm">Yes</button>
                            <button onClick={() => setDeletingFamily(null)} className="bg-gray-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-gray-500 transition text-sm">No</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeletingFamily(family.familyId)} className="bg-red-900/50 border border-red-700 text-red-400 px-4 py-2 rounded-lg font-bold hover:bg-red-800/50 transition text-sm flex-shrink-0">
                            🗑
                          </button>
                        )
                      )}
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t border-gray-700 px-5 pb-5 pt-4 space-y-5">

                        {/* Settings */}
                        <div>
                          <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Settings</p>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="bg-gray-700/50 rounded-xl p-3 text-center">
                              <p className="text-gray-400 text-xs mb-1">Reward</p>
                              <p className="text-white font-bold text-sm capitalize">{family.rewardMode}</p>
                            </div>
                            <div className="bg-gray-700/50 rounded-xl p-3 text-center">
                              <p className="text-gray-400 text-xs mb-1">Payday</p>
                              <p className="text-white font-bold text-sm">{dayNames[family.payday]}</p>
                            </div>
                            <div className="bg-gray-700/50 rounded-xl p-3 text-center">
                              <p className="text-gray-400 text-xs mb-1">Parent PIN</p>
                              <p className="text-white font-bold text-sm">{family.parentPin} {family.pinHashed ? '🔒' : '⚠️'}</p>
                            </div>
                          </div>
                        </div>

                        {/* Children */}
                        {children.length > 0 && (
                          <div>
                            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Children</p>
                            <div className="space-y-1">
                              {children.map(child => (
                                <div key={child.id} className="flex justify-between items-center bg-gray-700/50 rounded-lg px-3 py-2">
                                  <p className="text-white font-medium">{child.name}</p>
                                  <p className="text-gray-400 text-xs">{child.pin ? (child.pinHashed ? '🔒 PIN set' : '⚠️ unhashed PIN') : 'No PIN'}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Task templates */}
                        {taskTemplates.length > 0 && (
                          <div>
                            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Task Templates ({taskTemplates.length})</p>
                            <div className="space-y-1">
                              {taskTemplates.map(t => (
                                <div key={t.id} className="flex justify-between items-center bg-gray-700/50 rounded-lg px-3 py-2">
                                  <p className="text-white text-sm font-medium">{t.title}</p>
                                  <p className="text-gray-400 text-xs">${parseFloat(t.amount||0).toFixed(2)} · {t.frequency} · {t.assignType}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* This week's tasks summary */}
                        {childTasks.length > 0 && (
                          <div>
                            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">This Week ({childTasks.length} tasks)</p>
                            <div className="grid grid-cols-3 gap-2">
                              <div className="bg-gray-700/50 rounded-xl p-3 text-center">
                                <p className="text-gray-400 text-xs mb-1">Total</p>
                                <p className="text-white font-bold">{childTasks.length}</p>
                              </div>
                              <div className="bg-gray-700/50 rounded-xl p-3 text-center">
                                <p className="text-gray-400 text-xs mb-1">Completed</p>
                                <p className="text-green-400 font-bold">{childTasks.filter(t => t.completed?.length > 0).length}</p>
                              </div>
                              <div className="bg-gray-700/50 rounded-xl p-3 text-center">
                                <p className="text-gray-400 text-xs mb-1">Pending</p>
                                <p className="text-yellow-400 font-bold">{childTasks.filter(t => !t.completed?.length).length}</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Members detail */}
                        <div>
                          <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Parent Accounts</p>
                          <div className="space-y-1">
                            {Object.entries(family.members).map(([uid, m]) => (
                              <div key={uid} className="bg-gray-700/50 rounded-lg px-3 py-2">
                                <p className="text-white text-sm font-medium">{m.email}</p>
                                <p className="text-gray-500 text-xs font-mono">{uid}</p>
                              </div>
                            ))}
                          </div>
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-4 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Loading ChoreChain...</h1>
        <p className="text-gray-600">Please wait...</p>
      </div>
    </div>
  );
};

export default FamilyChoreApp;