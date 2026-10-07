import AppTabs from '@/components/app-tabs';

// Route-group layout: everything under src/app/(tabs)/ renders inside the bottom tab bar.
// Splash and Login (src/app/index.tsx, src/app/login.tsx) live one level up, outside this
// group, so they render full-screen without the tab bar — see src/app/_layout.tsx.
export default function TabsLayout() {
  return <AppTabs />;
}
