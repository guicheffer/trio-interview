import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './shared/**/*.ts',
  ],
  theme: {
    extend: {
      colors: {
        // The purple of the logo (500 is its exact value). White text passes AA on 500 and darker; purple text on the dark theme uses 300.
        accent: {
          50: '#F1F0FF',
          100: '#E3E2FE',
          200: '#C7C4FD',
          300: '#9D98FB',
          400: '#736CF9',
          500: '#5850F8',
          600: '#473FE0',
          700: '#3730C1',
          800: '#342F95',
          900: '#2D2A71',
        },
      },
      screens: {
        'xs': '480px',
        // Tailwind defaults:
        // 'sm': '640px',
        // 'md': '768px',
        // 'lg': '1024px',
        // 'xl': '1280px',
        // '2xl': '1536px',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;
