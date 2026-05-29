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
const productApiLabel = document.querySelector("#productApiLabel");
const productTitle = document.querySelector("#productTitle");
const modelDetail = document.querySelector("#modelDetail");
const keyStatus = document.querySelector("#keyStatus");
const proxyStatus = document.querySelector("#proxyStatus");
const quotaStatus = document.querySelector("#quotaStatus");
const quotaLabel = document.querySelector("#quotaLabel");
const charCount = document.querySelector("#charCount");
const toast = document.querySelector("#toast");
const noticeModal = document.querySelector("#noticeModal");
const noticeButton = document.querySelector("#noticeButton");
const closeNoticeButton = document.querySelector("#closeNoticeButton");
const confirmNoticeButton = document.querySelector("#confirmNoticeButton");
const themeButton = document.querySelector("#themeButton");
const allCount = document.querySelector("#allCount");
const recommendedCount = document.querySelector("#recommendedCount");
const busyCount = document.querySelector("#busyCount");

const messageStorageKey = "openai-web-chat-messages-v2";
const themeStorageKey = "openai-web-theme";
const defaultMessages = [
  {
    role: "assistant",
    text: "你好，登录已完成。现在可以向 GPT 提问。",
  },
];

let conversation = loadMessages();
let isAsking = false;

applySavedTheme();
bindEvents();
bootstrap();

function bindEvents() {
  loginForm.addEventListener("submit", handleLogin);
  askForm.addEventListener("submit", handleAsk);
  logoutButton.addEventListener("click", handleLogout);
  clearButton.addEventListener("click", clearConversation);
  questionInput.addEventListener("input", updateCharCount);
  questionInput.addEventListener("keydown", handleComposerKeydown);
  noticeButton.addEventListener("click", () => toggleNotice(true));
  closeNoticeButton.addEventListener("click", () => toggleNotice(false));
  confirmNoticeButton.addEventListener("click", () => toggleNotice(false));
  noticeModal.addEventListener("click", (event) => {
    if (event.target === noticeModal) toggleNotice(false);
  });
  themeButton.addEventListener("click", toggleTheme);

  document.querySelectorAll(".quick-prompts button").forEach((button) => {
    button.addEventListener("click", () => {
      questionInput.value = button.dataset.prompt || "";
      updateCharCount();
      questionInput.focus();
    });
  });

  document.querySelectorAll(".filter-chip").forEach((button) => {
    button.addEventListener("click", () => setChannelFilter(button.dataset.filter));
  });

  document.querySelectorAll(".nav-item[data-mode]").forEach((button) => {
    button.addEventListener("click", () => setMode(button));
  });
}

async function handleLogin(event) {
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
    showToast("登录完成");
  } catch (error) {
    loginMessage.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "登录";
  }
}

async function handleAsk(event) {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question || isAsking) return;

  addMessage("user", question);
  questionInput.value = "";
  updateCharCount();
  setAsking(true);

  const pending = addMessage("assistant", "正在生成...");

  try {
    const data = await api("/api/ask", {
      method: "POST",
      body: { question },
    });
    updateMessage(pending, data.answer);
    if (data.model) updateModel(data.model);
    setQuotaState("请求完成", "空闲", false);
  } catch (error) {
    const message = formatError(error.message);
    updateMessage(pending, message);
    setQuotaState(detectQuota(message), "需检查", true);
  } finally {
    setAsking(false);
    questionInput.focus();
  }
}

function handleComposerKeydown(event) {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    askForm.requestSubmit();
  }
}

async function handleLogout() {
  await api("/api/logout", { method: "POST" }).catch(() => {});
  showLogin();
  showToast("已退出登录");
}

async function bootstrap() {
  renderMessages();
  updateCharCount();
  updateCounts();

  try {
    const data = await api("/api/session");
    if (data.loggedIn) {
      showChat(data.username);
      updateRuntimeStatus(data);
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

async function loadSession() {
  const data = await api("/api/session");
  if (data.loggedIn) updateRuntimeStatus(data);
}

function updateRuntimeStatus(data) {
  sessionStatus.textContent = data.username || "已登录";
  updateModel(data.model || "未设置");
  keyStatus.textContent = data.apiKeyConfigured ? "已配置" : "未配置";
  proxyStatus.textContent = data.proxyEnabled
    ? data.proxyTarget || "已启用"
    : "未启用";
}

function updateModel(model) {
  modelName.textContent = model;
  modelDetail.textContent = model;
}

function showChat(username = "已登录") {
  loginView.classList.add("hidden");
  chatView.classList.remove("hidden");
  sessionStatus.textContent = username;
  renderMessages();
  questionInput.focus();
}

function showLogin() {
  chatView.classList.add("hidden");
  loginView.classList.remove("hidden");
  loginMessage.textContent = "";
}

function addMessage(role, text, options = {}) {
  const message = {
    id: crypto.randomUUID(),
    role,
    text,
    createdAt: new Date().toISOString(),
  };
  conversation.push(message);
  if (options.persist !== false) saveMessages();
  return appendMessage(message);
}

function updateMessage(article, text) {
  const id = article.dataset.messageId;
  const message = conversation.find((item) => item.id === id);
  if (message) {
    message.text = text;
    saveMessages();
  }

  article.querySelector(".bubble").textContent = text;
  const copyButton = article.querySelector(".copy-button");
  if (copyButton) copyButton.hidden = false;
  messages.scrollTop = messages.scrollHeight;
}

function renderMessages() {
  messages.innerHTML = "";
  if (!conversation.length) conversation = [...defaultMessages];
  conversation.forEach((message) => appendMessage(message));
  messages.scrollTop = messages.scrollHeight;
}

function appendMessage(message) {
  const article = document.createElement("article");
  article.className = `message ${message.role}`;
  article.dataset.messageId = message.id || crypto.randomUUID();

  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = message.role === "user" ? "你" : "GPT";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = message.text;

  article.append(meta, bubble);

  if (message.role === "assistant") {
    const actions = document.createElement("div");
    actions.className = "message-actions";

    const copyButton = document.createElement("button");
    copyButton.className = "copy-button";
    copyButton.type = "button";
    copyButton.textContent = "复制";
    copyButton.hidden = message.text === "正在生成...";
    copyButton.addEventListener("click", () => copyText(message.text));

    actions.append(copyButton);
    article.append(actions);
  }

  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
  return article;
}

function clearConversation() {
  conversation = [...defaultMessages].map((message) => ({
    ...message,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }));
  saveMessages();
  renderMessages();
  setQuotaState("等待请求", "待确认", true);
  showToast("对话已清空");
}

function loadMessages() {
  try {
    const parsed = JSON.parse(localStorage.getItem(messageStorageKey) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.text === "string")
      .slice(-40)
      .map((item) => ({
        id: item.id || crypto.randomUUID(),
        role: item.role === "user" ? "user" : "assistant",
        text: item.text,
        createdAt: item.createdAt || new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

function saveMessages() {
  localStorage.setItem(messageStorageKey, JSON.stringify(conversation.slice(-40)));
}

function setAsking(nextValue) {
  isAsking = nextValue;
  sendButton.disabled = nextValue;
  sendButton.textContent = nextValue ? "等待" : "发送";
  questionInput.disabled = nextValue;
}

function updateCharCount() {
  charCount.textContent = `${questionInput.value.length} / 4000`;
}

function setQuotaState(text, label, isBusy) {
  quotaStatus.textContent = text;
  quotaLabel.textContent = label;
  const card = quotaStatus.closest(".channel-card");
  card.classList.toggle("busy", isBusy);
  card.dataset.filterValue = isBusy ? "busy" : "recommended";
  updateCounts();
}

function detectQuota(message) {
  const lower = message.toLowerCase();
  if (lower.includes("quota") || lower.includes("billing")) {
    return "额度或账单异常";
  }
  if (lower.includes("incorrect api key") || lower.includes("api key")) {
    return "Key 需要检查";
  }
  if (lower.includes("fetch failed") || lower.includes("proxy")) {
    return "网络或代理异常";
  }
  return "请求失败";
}

function formatError(message) {
  return message.replace(/sk-[A-Za-z0-9_-]+/g, "sk-***");
}

function setChannelFilter(filter) {
  document.querySelectorAll(".filter-chip").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === filter);
  });

  document.querySelectorAll(".channel-card").forEach((card) => {
    const value = card.dataset.filterValue;
    card.hidden = filter !== "all" && value !== filter;
  });
}

function updateCounts() {
  const cards = [...document.querySelectorAll(".channel-card")];
  const recommended = cards.filter(
    (card) => card.dataset.filterValue === "recommended"
  ).length;
  const busy = cards.filter((card) => card.dataset.filterValue === "busy").length;

  allCount.textContent = String(cards.length);
  recommendedCount.textContent = String(recommended);
  busyCount.textContent = String(busy);
}

function setMode(activeButton) {
  document.querySelectorAll(".nav-item[data-mode]").forEach((button) => {
    button.classList.toggle("active", button === activeButton);
  });

  const productName = activeButton.dataset.product || activeButton.textContent.trim();
  productApiLabel.textContent = productName;
  productTitle.textContent = productName;

  const modeText = activeButton.textContent.trim();
  showToast(`已切换：${modeText}`);
}

function toggleNotice(isVisible) {
  noticeModal.classList.toggle("hidden", !isVisible);
}

function applySavedTheme() {
  const saved = localStorage.getItem(themeStorageKey);
  if (saved === "dark") document.documentElement.dataset.theme = "dark";
  updateThemeButton();
}

function toggleTheme() {
  const isDark = document.documentElement.dataset.theme === "dark";
  if (isDark) {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem(themeStorageKey, "light");
  } else {
    document.documentElement.dataset.theme = "dark";
    localStorage.setItem(themeStorageKey, "dark");
  }
  updateThemeButton();
}

function updateThemeButton() {
  const isDark = document.documentElement.dataset.theme === "dark";
  themeButton.lastChild.textContent = isDark ? " 浅色模式" : " 深色模式";
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("已复制");
  } catch {
    showToast("复制失败");
  }
}

function showToast(text) {
  toast.textContent = text;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("visible");
  }, 1800);
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
