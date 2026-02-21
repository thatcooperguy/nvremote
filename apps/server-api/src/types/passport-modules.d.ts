declare module 'passport-microsoft' {
  import { Strategy as PassportStrategy } from 'passport';
  interface StrategyOptions {
    clientID: string;
    clientSecret: string;
    callbackURL: string;
    scope?: string[];
    tenant?: string;
    authorizationURL?: string;
    tokenURL?: string;
  }
  type VerifyCallback = (
    err: Error | null,
    user?: Record<string, unknown>,
    info?: Record<string, unknown>,
  ) => void;
  class Strategy extends PassportStrategy {
    constructor(
      options: StrategyOptions,
      verify: (
        accessToken: string,
        refreshToken: string,
        profile: Record<string, unknown>,
        done: VerifyCallback,
      ) => void,
    );
  }
  export { Strategy };
}

declare module 'passport-apple' {
  import { Strategy as PassportStrategy } from 'passport';
  interface StrategyOptions {
    clientID: string;
    teamID: string;
    keyID: string;
    privateKeyLocation?: string;
    privateKeyString?: string;
    callbackURL: string;
    scope?: string[];
    passReqToCallback?: boolean;
  }
  type VerifyCallback = (
    err: Error | null,
    user?: Record<string, unknown>,
    info?: Record<string, unknown>,
  ) => void;
  class Strategy extends PassportStrategy {
    constructor(
      options: StrategyOptions,
      verify: (
        req: unknown,
        accessToken: string,
        refreshToken: string,
        idToken: Record<string, unknown>,
        profile: Record<string, unknown>,
        done: VerifyCallback,
      ) => void,
    );
  }
  export default Strategy;
}

declare module 'passport-discord' {
  import { Strategy as PassportStrategy } from 'passport';
  interface StrategyOptions {
    clientID: string;
    clientSecret: string;
    callbackURL: string;
    scope?: string[];
  }
  interface Profile {
    id: string;
    username: string;
    global_name?: string;
    avatar?: string;
    email?: string;
    discriminator?: string;
    verified?: boolean;
    provider: string;
  }
  type VerifyCallback = (
    err: Error | null,
    user?: Record<string, unknown>,
    info?: Record<string, unknown>,
  ) => void;
  class Strategy extends PassportStrategy {
    constructor(
      options: StrategyOptions,
      verify: (
        accessToken: string,
        refreshToken: string,
        profile: Profile,
        done: VerifyCallback,
      ) => void,
    );
  }
  export { Strategy, Profile };
}
