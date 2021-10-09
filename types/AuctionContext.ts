import { SessionData } from './SessionData';
import type { Context, SessionFlavor } from 'grammy';

type AuctionContext = Context & SessionFlavor<SessionData>;

export type { AuctionContext };