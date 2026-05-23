/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#F3F1FE',
          100: '#E8E4FD',
          200: '#D1C9FB',
          300: '#B0A1F7',
          400: '#8B7CF2',
          500: '#6C5CE7',
          600: '#5B4ED4',
          700: '#4A3FB8',
          800: '#3D3499',
          900: '#332C7E',
          950: '#1E1A4D',
        },
        accent: {
          green: '#00D2A0',
          red: '#FF6B6B',
          blue: '#4FACFE',
          yellow: '#FECA57',
        },
        surface: {
          50: '#F5F5F7',
          100: '#EEEEF0',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#1A1D2E',
          950: '#12141F',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'slide-up': 'slideUp 0.5s ease-out',
        'fade-in': 'fadeIn 0.5s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'hover-lift': 'hoverLift 0.3s ease',
        'pulse-ring': 'pulseRing 2s ease-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(108, 92, 231, 0.5), 0 0 10px rgba(108, 92, 231, 0.3)' },
          '100%': { boxShadow: '0 0 20px rgba(108, 92, 231, 0.8), 0 0 30px rgba(108, 92, 231, 0.4)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        hoverLift: {
          '0%': { transform: 'translateY(0)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
          '100%': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' },
        },
        pulseRing: {
          '0%': { transform: 'scale(1)', opacity: '0.5' },
          '100%': { transform: 'scale(1.5)', opacity: '0' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      }
    },
  },
  plugins: [],
}
