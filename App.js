import "./global.css";
import React, { useState } from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Pacifico_400Regular } from '@expo-google-fonts/pacifico';
import { StatusBar } from 'expo-status-bar';
import { AppProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { C } from './constants/colors';
import { F } from './constants/fonts';

import SplashScreen from './screens/SplashScreen';
import LoginScreen from './screens/LoginScreen';
import ConnectBankScreen from './screens/ConnectBankScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import DashboardScreen from './screens/DashboardScreen';
import DiscoverScreen from './screens/DiscoverScreen';
import PortfolioScreen from './screens/PortfolioScreen';
import ProfileScreen from './screens/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ emoji, focused }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>{emoji}</Text>;
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.card,
          borderTopColor: C.border,
          borderTopWidth: 1,
          height: 82,
          paddingBottom: 18,
          paddingTop: 10,
          shadowColor: C.shadow,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 12,
          elevation: 8,
        },
        tabBarActiveTintColor: C.orange,
        tabBarInactiveTintColor: C.muted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: F.semibold,
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Discover"
        component={DiscoverScreen}
        options={{
          tabBarLabel: 'Discover',
          tabBarIcon: ({ focused }) => <TabIcon emoji="✦" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Portfolio"
        component={PortfolioScreen}
        options={{
          tabBarLabel: 'Portfolio',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📈" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { user, authLoading, bankConnected, onboardingDone } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  // Show splash until both the 1800ms animation AND Firebase auth check complete
  if (!splashDone) {
    return (
      <SplashScreen
        authLoading={authLoading}
        onDone={() => setSplashDone(true)}
      />
    );
  }

  // Conditional navigator — React Navigation automatically transitions between
  // screens as user/bankConnected state changes. No manual navigation.replace() needed.
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      {!user ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : !onboardingDone ? (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      ) : !bankConnected ? (
        <Stack.Screen name="ConnectBank" component={ConnectBankScreen} />
      ) : (
        <Stack.Screen name="Main" component={MainTabs} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    Pacifico_400Regular,
  });

  if (!fontsLoaded) return null;

  return (
    <AuthProvider>
      <AppProvider>
        <NavigationContainer>
          <StatusBar style="dark" />
          <RootNavigator />
        </NavigationContainer>
      </AppProvider>
    </AuthProvider>
  );
}
