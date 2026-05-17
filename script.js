const header = document.querySelector("[data-header]");
const nav = document.querySelector("[data-nav]");
const navToggle = document.querySelector("[data-nav-toggle]");
const contactForm = document.querySelector("[data-contact-form]");
const formStatus = document.querySelector("[data-form-status]");

const syncHeader = () => {
  header.classList.toggle("is-scrolled", window.scrollY > 12);
};

syncHeader();
window.addEventListener("scroll", syncHeader, { passive: true });

navToggle.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("is-open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
});

nav.addEventListener("click", (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    nav.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
  }
});

const encodeFormData = (formData) => new URLSearchParams(formData).toString();

contactForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = contactForm.querySelector("button");
  const formData = new FormData(contactForm);

  button.disabled = true;
  button.textContent = "Sending...";
  formStatus.textContent = "";
  formStatus.className = "form-status";

  try {
    const response = await fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: encodeFormData(formData),
    });

    if (!response.ok) {
      throw new Error("Contact request failed");
    }

    contactForm.reset();
    formStatus.textContent = "Thank you. Your request has been sent.";
    formStatus.classList.add("is-success");
    button.textContent = "Request sent";
  } catch (error) {
    formStatus.textContent = "Sorry, the message could not be sent. Please try again or email us directly.";
    formStatus.classList.add("is-error");
    button.textContent = "Request consultation";
  } finally {
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = "Request consultation";
    }, 1800);
  }
});
