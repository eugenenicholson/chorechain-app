import React, { useState, useEffect } from 'react';
import { Plus, DollarSign, Edit2, Trash2, Calendar, LogOut, CheckCircle2, X, ArrowRight, TrendingUp } from 'lucide-react';

// Firebase imports
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { getDatabase, ref, set, get, remove, onValue } from 'firebase/database';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBavpvKFdmfGtE773de20UNSgSobgseq64",
  authDomain: "chorechain-ff621.firebaseapp.com",
  databaseURL: "https://chorechain-ff621-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "chorechain-ff621",
  storageBucket: "chorechain-ff621.firebasestorage.app",
  messagingSenderId: "407813709495",
  appId: "1:407813709495:web:236c6baaab0cbfeaa7b732",
  measurementId: "G-7RH79ZPN9C"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

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

  // Listen to auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        const familiesRef = ref(database, 'families');
        const snapshot = await get(familiesRef);
        
        if (snapshot.exists()) {
          const families = snapshot.val();
          for (const fid in families) {
            const family = families[fid];
            if (family.members && family.members[user.uid]) {
              setFamilyId(fid);
              const familyRef = ref(database, `families/${fid}`);
              onValue(familyRef, (snap) => {
                if (snap.exists()) {
                  setFamilyData(snap.val());
                }
              });
              setScreen('family-home');
              return;
            }
          }
        }
      } else {
        setCurrentUser(null);
        setFamilyId(null);
        setFamilyData(null);
        setScreen('login');
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
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;
      const newFamilyId = Math.random().toString(36).substring(2, 10).toUpperCase();
      
      const familyRef = ref(database, `families/${newFamilyId}`);
      await set(familyRef, {
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
      });
      
      setFamilyId(newFamilyId);
      setFamilyName('');
      setEmail('');
      setPassword('');
      setScreen('family-home');
    } catch (error) {
      setErrorMsg(error.message);
    } finally {
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

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setEmail('');
      setPassword('');
    } catch (error) {
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
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
  const deleteTaskTemplate = async (templateId) => {
    try {
      const templateRef = ref(database, `families/${familyId}/taskTemplates/${templateId}`);
      await remove(templateRef);
    } catch (error) {
      setErrorMsg(error.message);
    }
  };

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
    if (parentPin.length !== 4 || !/^\d+$/.test(parentPin)) {
      setErrorMsg('PIN must be exactly 4 digits');
      return;
    }

    try {
      const pinRef = ref(database, `families/${familyId}/parentPin`);
      await set(pinRef, parentPin);
      setScreen('parent');
      setParentPin('');
    } catch (error) {
      setErrorMsg(error.message);
    }
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
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      
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

            {errorMsg && <p className="text-red-600 text-sm font-medium">{errorMsg}</p>}

            <button
              onClick={signIn}
              disabled={loading}
              className="w-full bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 text-white py-3 rounded-xl font-bold hover:shadow-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? 'Signing in...' : <>Sign In <ArrowRight className="w-4 h-4" /></>}
            </button>

            <div className="border-t border-gray-200 pt-4 text-center">
              <p className="text-gray-600 text-sm mb-3">Don't have an account?</p>
              <button
                onClick={() => {
                  setScreen('signup');
                  setEmail('');
                  setPassword('');
                  setErrorMsg('');
                }}
                className="text-purple-600 font-bold hover:text-purple-700 text-sm"
              >
                Create a Family Account
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
            onClick={() => setScreen('login')} 
            className="text-purple-600 font-bold mb-6 flex items-center gap-1"
          >
            ← Back
          </button>

          <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-2xl p-8 space-y-6 border border-white/20">
            <h2 className="text-2xl font-display font-bold text-gray-900">Create Family Account</h2>

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
              Your family gets a unique ID to share with others.
            </p>
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
            <p className="text-gray-600 font-light">ID: <span className="font-bold text-purple-600">{familyId}</span></p>
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
                        setCurrentChildId(child.id);
                        setScreen('child');
                      }}
                      className="w-full bg-gradient-to-r from-pink-400 via-purple-400 to-indigo-400 text-white py-3 rounded-2xl font-bold hover:shadow-lg transition shadow-md"
                    >
                      👧 {child.name}
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
                type="tel"
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
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="••••"
                  value={pinAttempt}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setPinAttempt(val);
                    if (val.length === 4) {
                      setTimeout(() => {
                        if (val === familyData.parentPin) {
                          setScreen('parent');
                          setPinAttempt('');
                          setErrorMsg('');
                        } else {
                          setErrorMsg('Incorrect PIN');
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
              </>
            )}

            <button
              onClick={() => setScreen('family-home')}
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

          {/* Earnings Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {familyData.children && Object.values(familyData.children).map(child => {
              const earnings = calculateChildEarnings(child.id);
              return (
                <div key={child.id} className="bg-gradient-to-br from-purple-100 to-indigo-100 rounded-2xl shadow-lg p-6 border border-purple-200">
                  <p className="text-gray-600 text-sm font-medium mb-2">This Week</p>
                  <p className="text-4xl font-bold text-transparent bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text">${earnings.toFixed(2)}</p>
                  <p className="text-gray-900 font-bold mt-2">{child.name}</p>
                </div>
              );
            })}
          </div>

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
              <input
                type="number"
                placeholder="Amount ($)"
                step="0.50"
                value={editingTemplate ? editingTemplate.amount : newTemplate.amount}
                onChange={(e) => editingTemplate ? setEditingTemplate({...editingTemplate, amount: e.target.value}) : setNewTemplate({...newTemplate, amount: e.target.value})}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none bg-white/50"
              />

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
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => (
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
                      <p className="text-lg font-bold text-green-600 mt-2">${parseFloat(template.amount).toFixed(2)}</p>
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
                    <p className="font-bold text-gray-900">{child.name}</p>
                  </div>
                ))}
              </div>
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
              <p className="text-gray-600 mb-6 font-light">Process earnings for all children</p>
              <button
                onClick={processWeeklyPayout}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3 rounded-xl font-bold hover:shadow-lg transition flex items-center justify-center gap-2"
              >
                <TrendingUp className="w-5 h-5" />
                Process Payout
              </button>
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
      return task.assignType === 'any' || task.assignedChild === currentChildId || (task.assignType === 'rotate');
    }) : [];

    // Group by day
    const tasksByDay = {};
    dayNames.forEach((_, idx) => {
      tasksByDay[idx] = childTasks.filter(task => task.dayOfWeek === idx);
    });

    // Reorder to start with Saturday
    const dayOrder = [6, 0, 1, 2, 3, 4, 5];

    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-8 mt-6">
            <div>
              <h1 className="text-3xl font-display font-bold text-gray-900">Hi, {childData?.name}! 👋</h1>
              <p className="text-gray-600 font-light">{familyData.name}</p>
            </div>
            <button
              onClick={() => setScreen('family-home')}
              className="flex items-center gap-2 bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition font-bold"
            >
              ← Back
            </button>
          </div>

          {/* Earnings Card */}
          <div className="bg-gradient-to-br from-green-400 via-emerald-400 to-teal-400 rounded-3xl shadow-2xl p-8 mb-8 text-white">
            <p className="text-sm font-light opacity-90 mb-2">This Week's Earnings</p>
            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-6xl font-bold">${childEarnings.toFixed(2)}</span>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4">
              <div className="w-full bg-white/30 rounded-full h-3 overflow-hidden mb-2">
                <div 
                  className="bg-white h-full rounded-full transition-all duration-300"
                  style={{width: `${Math.min((childEarnings / 50) * 100, 100)}%`}}
                ></div>
              </div>
              <p className="text-sm font-light opacity-90">Progress to $50 goal</p>
            </div>
          </div>

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
                                    <DollarSign className="w-5 h-5" />
                                    {parseFloat(task.amount).toFixed(2)}
                                  </div>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                {!isAccepted && !isCompleted && (
                                  <button
                                    onClick={() => acceptTask(task.id)}
                                    className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-4 py-2 rounded-lg font-bold hover:shadow-lg transition whitespace-nowrap text-sm"
                                  >
                                    Accept
                                  </button>
                                )}
                                {(isAccepted || isAssigned) && !isCompleted && (
                                  <button
                                    onClick={() => completeTask(task.id)}
                                    className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-4 py-2 rounded-lg font-bold hover:shadow-lg transition whitespace-nowrap text-sm"
                                  >
                                    Done
                                  </button>
                                )}
                                {isCompleted && (
                                  <div className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold text-sm">
                                    ✓ Done
                                  </div>
                                )}
                                {(isAccepted && !isAssigned && !isCompleted) && (
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