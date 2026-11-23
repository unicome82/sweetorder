import { createRoot } from 'react-dom/client';
import { Guide } from './Guide';

const root = document.getElementById('root');
if (!root) throw new Error('가이드 루트 요소가 없습니다.');
createRoot(root).render(<Guide />);
