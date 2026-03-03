import { useSearchParams } from 'react-router-dom';
import { LoginForm } from '../components/auth/LoginForm';

export default function Login() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') === 'signup' ? 'signup' : 'login';

  return <LoginForm initialMode={mode} />;
}
