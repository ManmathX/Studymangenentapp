import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';

export const useNetworkStore = create(() => ({ isOnline: true }));

/** Starts listening for connectivity changes. Returns the unsubscribe function. */
export function watchNetwork() {
  return NetInfo.addEventListener((state) => {
    const online = state.isConnected !== false && state.isInternetReachable !== false;
    if (online !== useNetworkStore.getState().isOnline) useNetworkStore.setState({ isOnline: online });
  });
}
