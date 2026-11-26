// 배포판(admin.cheesehistory.com/gym/)에서만 쓰는 부분: 코치 서버 주소와 구글 로그인.
// 로컬(localhost)에서는 쓰지 않는다.
export const IS_REMOTE = !["localhost", "127.0.0.1"].includes(location.hostname);
export const API_BASE = IS_REMOTE ? "https://asia-northeast3-cheese-history-platform.cloudfunctions.net/gymCoach" : "";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBgLF7lEKQxdsUked-i_Pf0FJEdP_d1Ab4",
  authDomain: "cheese-history-platform.firebaseapp.com",
  projectId: "cheese-history-platform",
  appId: "1:206588835864:web:18cc695d72c6fc96c4ab6d",
};
const V = "10.7.1";

let auth = null;
let mod = null;

async function boot() {
  if (auth) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  mod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
  const app = appMod.initializeApp(FIREBASE_CONFIG, "gym");
  auth = mod.getAuth(app);
  await mod.setPersistence(auth, mod.browserLocalPersistence);
}

// 로그인된 사용자를 기다린다. 없으면 null.
export async function currentUser() {
  if (!IS_REMOTE) return null;
  await boot();
  await auth.authStateReady();
  return auth.currentUser;
}

export async function signIn() {
  await boot();
  const provider = new mod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  await mod.signInWithPopup(auth, provider);
  return auth.currentUser;
}

export async function signOut() {
  if (auth) await mod.signOut(auth);
}

export async function authHeader() {
  if (!IS_REMOTE) return {};
  const u = await currentUser();
  if (!u) return {};
  return { authorization: `Bearer ${await u.getIdToken()}` };
}
