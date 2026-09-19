/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./*.{js,jsx}"],
  theme: {
    extend: {
      borderColor: {
        DEFAULT: '#1a1a1a',
      },
    },
  },
  plugins: [],
};
