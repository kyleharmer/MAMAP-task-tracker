import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Public web config — expected to be visible client-side; Firebase secures
// data through Realtime Database rules, not by hiding this object.
const firebaseConfig = {
  apiKey: "AIzaSyCZWjm0M-aWJKTv9CTBYmo5G3O00rtAT30",
  authDomain: "mamap-task-tracker.firebaseapp.com",
  databaseURL: "https://mamap-task-tracker-default-rtdb.firebaseio.com",
  projectId: "mamap-task-tracker",
  storageBucket: "mamap-task-tracker.firebasestorage.app",
  messagingSenderId: "246952475581",
  appId: "1:246952475581:web:edff316b6749e9f26c70d4",
  measurementId: "G-WETKSYJQGZ",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
