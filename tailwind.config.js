export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0F172A',
        panel: '#FFFFFF',
        border: '#E2E8F0',
        grass: '#10B981',
        rose: '#EF4444',
        mist: '#F8FAFC'
      },
      boxShadow: {
        soft: '0 10px 30px rgba(15, 23, 42, 0.06)'
      }
    }
  },
  plugins: []
};
