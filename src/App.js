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
  // ============ STATE ============
  
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

  // ============ FIREBASE FUNCTIONS ============

  // Listen to auth state
 // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {