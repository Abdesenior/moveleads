import { useContext } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { AuthContext } from '../../context/AuthContext';
import WidgetPage from '../WidgetPage';

export default function Widget() {
  const { user } = useContext(AuthContext);
  return (
    <DashboardLayout>
      <WidgetPage user={user} insideDashboard={true} />
    </DashboardLayout>
  );
}
