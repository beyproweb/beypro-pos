// tailwind.config.js
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  safelist: [
    'bg-accent',
    'text-accent',
    'ring-accent',
    'border-accent',
    'hover:bg-accent',
    'accent-accent',
  ],
  theme: {
    extend: {
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(40px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        blobPulse: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
      },
      animation: {
        fadeInUp: 'fadeInUp 0.8s ease-out both',
        blob: 'blobPulse 6s ease-in-out infinite',
      },
      colors: {
        accent: 'rgb(var(--accent-color) / <alpha-value>)',
      },
      fontSize: {
        base: 'var(--font-size)',
      },
    },
  },
  plugins: [],
};
