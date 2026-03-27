import { contextBridge } from 'electron';
import { seroPreloadApi } from './preload/api';

contextBridge.exposeInMainWorld('sero', seroPreloadApi);
