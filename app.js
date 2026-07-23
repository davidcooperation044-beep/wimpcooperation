const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const loginButton = document.querySelector("#login-button");

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!loginButton) return;

    const email = document.querySelector("#email").value;
    const password = document.querySelector("#password").value;

    loginButton.textContent = "Signing in...";
    loginButton.disabled = true;
    loginError.textContent = "";

    try {
      // Placeholder logic: replace with real auth calls when ready.
      if (!email || !password) {
        throw new Error("Email and password are required.");
      }
      if (!email.includes("@")) {
        throw new Error("Enter a valid email address.");
      }
      window.location.href = "index.html";
    } catch (error) {
      loginError.textContent = error.message || "Login failed.";
    } finally {
      loginButton.textContent = "Sign in";
      loginButton.disabled = false;
    }
  });
}
