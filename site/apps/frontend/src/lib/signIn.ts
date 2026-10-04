import { useLocation, useNavigate } from 'react-router';
import * as m from '@/paraglide/messages.js';

/** What the sign-in page is opened with: its first form, the track to keep, where to go back. */
export interface SignInState {
  mode?: 'signin' | 'signup';
  keepTitle?: string;
  from?: string;
}

/** Opens the sign-in page, remembering the page to come back to once signed in. */
export function useOpenSignIn(): (state?: Omit<SignInState, 'from'>) => void {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (state = {}) => void navigate(m.signin_href(), { state: { ...state, from: pathname } });
}
