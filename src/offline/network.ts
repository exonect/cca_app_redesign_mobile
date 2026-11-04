/** Follows the phone's network state (expo-network, SDK 58: getNetworkStateAsync
 * and addNetworkStateListener) into the connectivity store. */
import * as Network from 'expo-network'

import { setNetwork } from './connectivity'

export function watchNetwork(): () => void {
  try {
    Network.getNetworkStateAsync().then(setNetwork, () => undefined)
    const sub = Network.addNetworkStateListener(setNetwork)
    return () => sub.remove()
  } catch {
    return () => undefined // no network module: rely on what requests see
  }
}
