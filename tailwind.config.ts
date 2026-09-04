import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          indigo: '#2F39A9',
          ocean: '#2E6FA0',
          cyan: '#49A4BB',
          mint: '#15D8B3',
        },
        surface: {
          dark: '#0B0F19',
          darkPanel: '#111827',
          darkSubtle: '#1E293B',
          light: '#F8FAFC',
          lightPanel: '#FFFFFF',
          lightSubtle: '#F1F5F9',
        },
      },
    },
  },
  plugins: [animate],
};

export default config;
