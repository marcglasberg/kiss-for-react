import { KissAction } from 'kiss-for-react';
import { State } from '../business/State';

export abstract class Action extends KissAction<State> {

    /**
    * Checks if the device has an internet connection.
    * Can be overridden by subclasses to provide custom internet connectivity checks.
    * 
    * By default, in web environment it uses `navigator.onLine`, and for other environments it returns `true`.  
    * Note `navigator.onLine` is not very useful, as it only tells you if there's a local connection, 
    * and not whether the internet is accessible.
    * 
    * It's recommended to override this method in your base action, to check for internet connectivity
    * in some other way that suits your needs.
    * 
    * For example, in React Native environments, we could use the `NetInfo` package 
    * (https://www.npmjs.com/package/@rescript-react-native/netinfo) to check for internet connectivity.
    * 
    * First, add NetInfo to your `package.json`:
    * 
    * ```json
    * "dependencies": {
    *   "@react-native-community/netinfo": "^11.4.1"
    * }
    * ```	
    * 
    * Then, import it in your action:
    * 
    * ```typescript
    * import NetInfo from '@react-native-community/netinfo';
    * ```
    * 
    * Finally, override the `hasInternet()` method:
    * 
    * ```typescript
    * protected hasInternet(): Promise<boolean> {
    *   return NetInfo.fetch().then(state => state.isConnected);
    * }
    * ```
    * 
    * Another option, for Node.js and the browser is using https://www.npmjs.com/package/is-online
    */
    protected hasInternet(): Promise<boolean> {
 
        // Web environment detection.
        const isWebEnvironment = typeof window !== 'undefined' && 'navigator' in window;

        // In web environment, use navigator.onLine. Otherwise, assume connected.
        return Promise.resolve(isWebEnvironment ? navigator.onLine : true);
    }
}



