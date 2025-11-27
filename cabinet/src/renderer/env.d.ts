/// <reference types="svelte" />
import type { RcadeAPI } from '../shared/types';

declare global {
  interface Window {
    rcade: RcadeAPI;
  }
}
