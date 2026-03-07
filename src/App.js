import React, { useState, useEffect } from 'react';
import { Plus, DollarSign, Edit2, Trash2, Calendar, LogOut } from 'lucide-react';

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
    specificDays: [],
    assignType: 'any',
    assignedChild: null,
    rotateChildren: []
  });

  // Listen to auth state - using useCallback to avoid dependency issues
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
        weeklyInstances: {},
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

  // LOGIN SCREEN
  if (screen === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-4">
        <div className="max-w-md mx-auto pt-20">
          <div className="text-center mb-12">
            <div className="inline-block bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl p-4 mb-4">
              <DollarSign className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">ChoreChain</h1>
            <p className="text-gray-600">Earn money by completing family chores</p>
          </div>

          <div className="bg-white rounded-3xl shadow-lg p-8 space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">Sign In</h2>
            
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
              disabled={loading}
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && signIn()}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
              disabled={loading}
            />

            {errorMsg && <p className="text-red-600 text-sm">{errorMsg}</p>}

            <button
              onClick={signIn}
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-xl font-bold hover:shadow-lg transition disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <div className="border-t pt-4 text-center">
              <p className="text-gray-600 text-sm mb-2">Don't have an account?</p>
              <button
                onClick={() => {
                  setScreen('signup');
                  setEmail('');
                  setPassword('');
                  setErrorMsg('');
                }}
                className="text-blue-600 font-semibold hover:text-blue-700"
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-4">
        <div className="max-w-md mx-auto pt-20">
          <button 
            onClick={() => setScreen('login')} 
            className="text-blue-600 font-semibold mb-6"
          >
            ← Back
          </button>

          <div className="bg-white rounded-3xl shadow-lg p-8 space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">Create Family Account</h2>

            <input
              type="text"
              placeholder="Family name (e.g., Smith Family)"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
              disabled={loading}
            />

            <input
              type="email"
              placeholder="Your email (parent)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
              disabled={loading}
            />

            <input
              type="password"
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
              disabled={loading}
            />

            {errorMsg && <p className="text-red-600 text-sm">{errorMsg}</p>}

            <button
              onClick={signUp}
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-xl font-bold hover:shadow-lg transition disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Family Account'}
            </button>

            <p className="text-gray-600 text-sm">
              Your family will get a unique ID to share with other family members.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // FAMILY HOME SCREEN
  if (screen === 'family-home' && familyData && currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-4">
        <div className="max-w-md mx-auto pt-20">
          <div className="text-center mb-12">
            <div className="inline-block bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl p-4 mb-4">
              <DollarSign className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">{familyData.name}</h1>
            <p className="text-gray-600 text-sm mb-4">Family ID: {familyId}</p>
            <p className="text-gray-600 text-xs">Share this ID with family members to join</p>
          </div>

          <div className="bg-white rounded-3xl shadow-lg p-8 space-y-4">
            <button
              onClick={() => setScreen('parentPin')}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-4 rounded-xl font-bold hover:shadow-lg transition text-lg"
            >
              👤 Parent
            </button>

            {familyData.children && Object.keys(familyData.children).length > 0 ? (
              <>
                <p className="text-gray-600 text-center text-sm mt-6 mb-2">Or select as child:</p>
                {Object.values(familyData.children).map(child => (
                  <button
                    key={child.id}
                    onClick={() => {
                      setCurrentChildId(child.id);
                      setScreen('child');
                    }}
                    className="w-full bg-gradient-to-r from-purple-400 to-pink-400 text-white py-3 rounded-xl font-bold hover:shadow-lg transition"
                  >
                    👧 {child.name}
                  </button>
                ))}
              </>
            ) : (
              <p className="text-gray-500 text-center text-sm mt-6">No children added yet. Parents, add children to get started!</p>
            )}

            <button
              onClick={logout}
              className="w-full text-red-600 font-semibold hover:text-red-700 mt-6 py-2 flex items-center justify-center gap-2"
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
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-4">
          <div className="max-w-md mx-auto pt-20">
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Set Parent PIN</h1>
              <p className="text-gray-600">4-digit PIN for parent access</p>
            </div>

            <div className="bg-white rounded-3xl shadow-lg p-8 space-y-6">
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
                className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl text-4xl text-center font-bold tracking-widest focus:border-blue-500 focus:outline-none"
              />

              {errorMsg && <p className="text-red-600 text-sm">{errorMsg}</p>}

              <button
                onClick={saveParentPin}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-xl font-bold hover:shadow-lg transition"
              >
                Set PIN
              </button>

              <button
                onClick={() => { setSettingPin(false); setParentPin(''); setErrorMsg(''); }}
                className="w-full text-gray-600 font-semibold hover:text-gray-700"
              >
                Skip for now
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-4">
        <div className="max-w-md mx-auto pt-20">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Parent Access</h1>
            <p className="text-gray-600">Enter your 4-digit PIN</p>
          </div>

          <div className="bg-white rounded-3xl shadow-lg p-8 space-y-6">
            {!familyData?.parentPin ? (
              <>
                <p className="text-gray-600 text-center">No PIN set yet. Set one to secure parent access.</p>
                <button
                  onClick={() => setSettingPin(true)}
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-xl font-bold hover:shadow-lg transition"
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
                  className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl text-4xl text-center font-bold tracking-widest focus:border-blue-500 focus:outline-none"
                  autoFocus
                />

                {errorMsg && <p className="text-red-600 text-sm text-center">{errorMsg}</p>}
              </>
            )}

            <button
              onClick={() => setScreen('family-home')}
              className="w-full text-blue-600 font-semibold hover:text-blue-700"
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-8 mt-6">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">{familyData.name}</h1>
              <p className="text-gray-600">Parent Dashboard</p>
            </div>
            <button
              onClick={() => setScreen('family-home')}
              className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition"
            >
              ← Back
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {familyData.children && Object.values(familyData.children).map(child => (
              <div key={child.id} className="bg-white rounded-2xl shadow p-6">
                <p className="text-gray-600 text-sm">This Week</p>
                <p className="text-3xl font-bold text-green-600">$0.00</p>
                <p className="text-gray-900 font-semibold mt-2">{child.name}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-3xl shadow-lg p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Create Task Template</h2>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Task title (e.g., Empty dishwasher)"
                value={editingTemplate ? editingTemplate.title : newTemplate.title}
                onChange={(e) => editingTemplate ? setEditingTemplate({...editingTemplate, title: e.target.value}) : setNewTemplate({...newTemplate, title: e.target.value})}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
              />
              <input
                type="number"
                placeholder="Amount ($)"
                step="0.50"
                value={editingTemplate ? editingTemplate.amount : newTemplate.amount}
                onChange={(e) => editingTemplate ? setEditingTemplate({...editingTemplate, amount: e.target.value}) : setNewTemplate({...newTemplate, amount: e.target.value})}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
              />

              <div>
                <p className="text-gray-700 font-semibold mb-2">Frequency:</p>
                <div className="space-y-2">
                  {['once', 'daily', 'weekly', 'specific'].map(freq => (
                    <label key={freq} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="frequency"
                        value={freq}
                        checked={(editingTemplate ? editingTemplate.frequency : newTemplate.frequency) === freq}
                        onChange={(e) => editingTemplate ? setEditingTemplate({...editingTemplate, frequency: e.target.value}) : setNewTemplate({...newTemplate, frequency: e.target.value})}
                        className="w-4 h-4"
                      />
                      <span className="capitalize">{freq === 'specific' ? 'Specific Days' : freq}</span>
                    </label>
                  ))}
                </div>
              </div>

              {(editingTemplate ? editingTemplate.frequency : newTemplate.frequency) === 'specific' && (
                <div>
                  <p className="text-gray-700 font-semibold mb-2">Select Days:</p>
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
                        className={`py-2 rounded-lg font-semibold transition ${
                          (editingTemplate ? editingTemplate.specificDays : newTemplate.specificDays).includes(idx)
                            ? 'bg-blue-500 text-white'
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
                <p className="text-gray-700 font-semibold mb-2">Assign To:</p>
                <select
                  value={editingTemplate ? editingTemplate.assignType : newTemplate.assignType}
                  onChange={(e) => editingTemplate ? setEditingTemplate({...editingTemplate, assignType: e.target.value}) : setNewTemplate({...newTemplate, assignType: e.target.value})}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
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
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select child</option>
                  {familyData.children && Object.values(familyData.children).map(child => (
                    <option key={child.id} value={child.id}>{child.name}</option>
                  ))}
                </select>
              )}

              {(editingTemplate ? editingTemplate.assignType : newTemplate.assignType) === 'rotate' && (
                <div>
                  <p className="text-gray-700 font-semibold mb-2">Children to Rotate:</p>
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
                          className="w-4 h-4"
                        />
                        <span>{child.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {errorMsg && <p className="text-red-600 text-sm">{errorMsg}</p>}

              <button
                onClick={createTaskTemplate}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-xl font-bold hover:shadow-lg transition flex items-center justify-center gap-2"
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

          <div className="bg-white rounded-3xl shadow-lg p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Task Templates</h2>
            <div className="space-y-3">
              {!familyData.taskTemplates || Object.keys(familyData.taskTemplates).length === 0 ? (
                <p className="text-gray-500">No task templates yet</p>
              ) : (
                Object.values(familyData.taskTemplates).map(template => (
                  <div key={template.id} className="border-2 border-gray-200 rounded-xl p-4 flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-bold text-gray-900">{template.title}</p>
                      <p className="text-sm text-gray-600 capitalize">Frequency: {template.frequency}</p>
                      {template.assignType === 'assigned' && (
                        <p className="text-sm text-gray-600">Assigned to: {familyData.children?.[template.assignedChild]?.name || 'Unknown'}</p>
                      )}
                      {template.assignType === 'rotate' && (
                        <p className="text-sm text-gray-600">Rotates between: {template.rotateChildren?.map(id => familyData.children?.[id]?.name).join(', ')}</p>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-3xl shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Manage Children</h2>
              <div className="space-y-3 mb-4">
                {familyData.children && Object.values(familyData.children).map(child => (
                  <div key={child.id} className="p-3 bg-gradient-to-r from-purple-100 to-pink-100 rounded-lg">
                    <p className="font-bold text-gray-900">{child.name}</p>
                  </div>
                ))}
              </div>
              <input
                type="text"
                placeholder="New child name"
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none mb-3"
              />
              <button
                onClick={addChildToFamily}
                className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition font-semibold"
              >
                Add Child
              </button>
            </div>

            <div className="bg-white rounded-3xl shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Weekly Payout</h2>
              <p className="text-gray-600 mb-4">Pay children for completed tasks this week.</p>
              <button
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3 rounded-xl font-bold hover:shadow-lg transition"
              >
                Process Weekly Payout
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
    
    // Get tasks available to this child
    const availableTasks = familyData.taskTemplates ? Object.values(familyData.taskTemplates).filter(task => {
      // Show if "any child" or assigned to this child
      return task.assignType === 'any' || task.assignedChild === currentChildId || (task.assignType === 'rotate');
    }) : [];

    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-8 mt-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Hi, {childData?.name}! 👋</h1>
              <p className="text-gray-600">{familyData.name}</p>
            </div>
            <button
              onClick={() => setScreen('family-home')}
              className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition"
            >
              ← Back
            </button>
          </div>

          <div className="bg-gradient-to-br from-green-400 to-emerald-500 rounded-3xl shadow-lg p-8 mb-8 text-white">
            <p className="text-sm opacity-90 mb-2">This Week's Earnings</p>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold">$0.00</span>
            </div>
            <div className="mt-6 bg-white/20 rounded-2xl p-4">
              <div className="w-full bg-white/30 rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-white h-full rounded-full transition-all duration-300"
                  style={{width: '0%'}}
                ></div>
              </div>
              <p className="text-sm mt-2 opacity-90">Progress to $50</p>
            </div>
          </div>

          {availableTasks.length === 0 ? (
            <div className="bg-white rounded-2xl shadow p-6 text-center">
              <Calendar className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600">No tasks available yet</p>
              <p className="text-gray-500 text-sm mt-2">Check back later or talk to your parents!</p>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Available Tasks</h2>
              {availableTasks.map(task => (
                <div key={task.id} className="bg-white rounded-2xl shadow p-6 hover:shadow-lg transition">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-gray-900">{task.title}</h3>
                      <div className="flex items-center gap-4 mt-3">
                        <div className="flex items-center gap-1 text-green-600 font-bold">
                          <DollarSign className="w-5 h-5" />
                          {parseFloat(task.amount).toFixed(2)}
                        </div>
                        <p className="text-sm text-gray-600 capitalize">
                          {task.frequency === 'once' && 'One time'}
                          {task.frequency === 'daily' && 'Daily'}
                          {task.frequency === 'weekly' && 'Weekly'}
                          {task.frequency === 'specific' && 'Specific days'}
                        </p>
                        {task.assignType === 'assigned' && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">Assigned to you</span>
                        )}
                      </div>
                    </div>
                    <button
                      className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-2 rounded-lg font-bold hover:shadow-lg transition whitespace-nowrap"
                    >
                      Accept
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-4 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Loading ChoreChain...</h1>
        <p className="text-gray-600">Please wait...</p>
      </div>
    </div>
  );
};

export default FamilyChoreApp;