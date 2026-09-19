/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./*.{js,jsx}"],
  theme: {
    extend: {
      borderColor: {
        DEFAULT: '#000000',
      },
    },
  },
  plugins: [],
};
