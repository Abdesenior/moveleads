import { useContext } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { AuthContext } from '../../context/AuthContext';
import WidgetPage from '../WidgetPage';

export default function Widget() {
  const { user, token, API_URL } = useContext(AuthContext);
  return (
    <DashboardLayout>
      <WidgetPage user={user} token={token} apiUrl={API_URL} insideDashboard={true} />
    </DashboardLayout>
  );
}
