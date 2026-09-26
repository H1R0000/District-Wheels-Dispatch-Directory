import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);
export function useAppAuth() { return useContext(AuthContext); }
