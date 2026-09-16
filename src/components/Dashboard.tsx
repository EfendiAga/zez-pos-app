import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { db, useLiveQuery } from '../lib/db';
import { canAccessSuperAdmin, getAllowedTabs, getDefaultTab } from '../lib/permissions';
import { Analytics } from './Analytics';
import { Customers } from './Customers';
import { Inventory } from './Inventory';
import { Kitchen } from './Kitchen';
import { Layout } from './Layout';
import { OrderHistory } from './OrderHistory';
import { POS } from './POS';
import { Reports } from './Reports';
import { Settings } from './Settings';
import { ShiftManager } from './ShiftManager';
import { Staff } from './Staff';
import { SuperAdmin } from './SuperAdmin';

export function Dashboard() {
  const { profile, effectiveProfile } = useAuth();
  const currentProfile = effectiveProfile || profile;
  const business = useLiveQuery(
    () => (currentProfile?.businessId ? db.businesses.get(currentProfile.businessId) : undefined),
    [currentProfile?.businessId]
  );
  const allowedTabs = getAllowedTabs(currentProfile, business);
  const [activeTab, setActiveTab] = useState<string>(getDefaultTab(currentProfile, business));

  useEffect(() => {
    const nextDefault = getDefaultTab(currentProfile, business);
    if (canAccessSuperAdmin(currentProfile) && activeTab !== 'super-admin') {
      setActiveTab('super-admin');
      return;
    }

    if (!allowedTabs.includes(activeTab as any)) {
      setActiveTab(nextDefault);
    }
  }, [activeTab, allowedTabs, business, currentProfile]);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Analytics />;
      case 'pos':
        return <POS />;
      case 'history':
        return <OrderHistory />;
      case 'kitchen':
        return <Kitchen />;
      case 'inventory':
        return <Inventory />;
      case 'debts':
        return <Customers />;
      case 'staff':
        return <Staff />;
      case 'reports':
        return <Reports />;
      case 'settings':
        return <Settings />;
      case 'shifts':
        return <ShiftManager />;
      case 'super-admin':
        return <SuperAdmin />;
      default:
        return <Analytics />;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
          transition={{ duration: 0.2 }}
          className="h-full w-full"
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </Layout>
  );
}
