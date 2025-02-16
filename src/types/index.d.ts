declare module 'game-server-compiler' {
    export enum ConnectionState {
        Connected,
        Disconnected,
        Connecting
    }

    export enum AuthState {
        Authenticated,
        NotAuthenticated,
        Authenticating
    }
} 
