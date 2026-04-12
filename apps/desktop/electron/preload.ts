import { contextBridge } from 'electron';
import type { SeroAPI } from '@/types/electron';
import { seroPreloadApi } from './preload/api';

const seroApiContract = seroPreloadApi satisfies SeroAPI;

contextBridge.exposeInMainWorld('sero', seroApiContract);
