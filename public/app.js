const loginView = document.querySelector("#loginView");
const chatView = document.querySelector("#chatView");
const loginForm = document.querySelector("#loginForm");
const askForm = document.querySelector("#askForm");
const logoutButton = document.querySelector("#logoutButton");
const clearButton = document.querySelector("#clearButton");
const loginMessage = document.querySelector("#loginMessage");
const messages = document.querySelector("#messages");
const questionInput = document.querySelector("#question");
const sendButton = document.querySelector("#sendButton");
const sessionStatus = document.querySelector("#sessionStatus");
const modelName = document.querySelector("#modelName");

bootstrap();

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "";

  const formData = new FormData(loginForm);
  const payload = {
    username: formData.get("username"),
    password: formData.get("password"),
  };

  const button = loginForm.querySelector("button");
  button.disabled = true;
  button.textContent = "登录中";

  try {
    const data = await api("/api/login", {
      method: "POST",
      body: payload,
    });
    showChat(data.username);
    await loadSession();
  } catch (error) {
    loginMessage.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "登录";
  }
});

askForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question) return;

  addMessage("user", question);
  questionInput.value = "";
  setAsking(true);

  const pending = addMessage("assistant", "正在生成...");

  try {
    const data = await api("/api/ask", {
      method: "POST",
      body: { question },
    });
    pending.querySelector(".bubble").textContent = data.answer;
    if (data.model) modelName.textContent = data.model;
  } catch (error) {
    pending.querySelector(".bubble").textContent = error.message;
  } finally {
    setAsking(false);
    questionInput.focus();
  }
});

questionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    askForm.requestSubmit();
  }
});

logoutButton.addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" }).catch(() => {});
  showLogin();
});

clearButton.addEventListener("click", () => {
  messages.innerHTML = "";
  addMessage("assistant", "对话已清空。");
});

async function bootstrap() {
  try {
    const data = await api("/api/session");
    if (data.loggedIn) {
      showChat(data.username);
      modelName.textContent = data.model || "未设置";
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

async function loadSession() {
  const data = await api("/api/session");
  if (data.loggedIn) {
    sessionStatus.textContent = data.username;
    modelName.textContent = data.model || "未设置";
  }
}

function showChat(username = "已登录") {
  loginView.classList.add("hidden");
  chatView.classList.remove("hidden");
  sessionStatus.textContent = username;
  questionInput.focus();
}

function showLogin() {
  chatView.classList.add("hidden");
  loginView.classList.remove("hidden");
  loginMessage.textContent = "";
}

function addMessage(role, text) {
  const article = document.createElement("article");
  article.className = `message ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  article.append(bubble);
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
  return article;
}

function setAsking(isAsking) {
  sendButton.disabled = isAsking;
  sendButton.textContent = isAsking ? "等待" : "发送";
  questionInput.disabled = isAsking;
}

async function api(url, options = {}) {
  const fetchOptions = {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (options.body) fetchOptions.body = JSON.stringify(options.body);

  const response = await fetch(url, fetchOptions);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "请求失败");
  }

  return data;
}
