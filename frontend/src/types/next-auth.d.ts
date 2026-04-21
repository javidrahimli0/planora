import NextAuth from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      accessToken: string;
      theme: string;
      avatar_url: string | null;
    };
  }
}
