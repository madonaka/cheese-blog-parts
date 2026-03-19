const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, query, where } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyBgLF7lEKQxdsUked-i_Pf0FJEdP_d1Ab4",
  authDomain: "auth.cheesehistory.com",
  projectId: "cheese-history-platform",
  storageBucket: "cheese-history-platform.firebasestorage.app",
  messagingSenderId: "206588835864",
  appId: "1:206588835864:web:18cc695d72c6fc96c4ab6d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkData() {
  console.log("Checking approval_documents...");
  const q = query(collection(db, "approval_documents"));
  const snap = await getDocs(q);
  console.log(`Total documents: ${snap.size}`);
  snap.forEach(d => {
    const data = d.data();
    console.log(`ID: ${d.id}, Title: ${data.title}, Status: ${data.status}, Recipient: ${data.recipient}, RecipientId: ${data.recipientId}`);
  });
  
  console.log("\nChecking employees...");
  const eSnap = await getDocs(collection(db, "employees"));
  eSnap.forEach(d => {
    console.log(`EmpID: ${d.id}, Name: ${d.data().displayName}, Depts: ${JSON.stringify(d.data().deptIds || [d.data().deptId])}`);
  });
}

checkData();
