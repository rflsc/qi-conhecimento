/** Credenciais padrão de dev — espelham SEED_ADMIN_* do .env raiz */
export const devLoginDefaults = {
  email: process.env.NEXT_PUBLIC_DEV_LOGIN_EMAIL ?? 'admin@altoqi.com.br',
  password: process.env.NEXT_PUBLIC_DEV_LOGIN_PASSWORD ?? 'AdminQi123!',
};
