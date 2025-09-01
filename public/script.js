window.addEventListener("load", function() {
      const loader = document.getElementById("loader");
      const login = document.querySelector(".login-container");

      loader.style.display = "none";      // hide loader
      login.style.display = "flex";       // show login
    });
window.addEventListener("load", function() {
      document.getElementById("loader").style.display = "none";
      document.querySelector(".login-container").style.display = "flex";
      
});
 const togglePassword = document.getElementById("togglePassword");
const passwordInput = document.getElementById("password");

togglePassword.addEventListener("click", function () {
    const type = passwordInput.type === "password" ? "text" : "password";
    passwordInput.type = type;

    // Toggle the eye / eye-slash icon
    this.classList.toggle("fa-eye");
    this.classList.toggle("fa-eye-slash");
  });

