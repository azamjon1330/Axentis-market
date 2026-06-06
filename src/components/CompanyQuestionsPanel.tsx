import { useState, useEffect } from 'react';
import { MessageCircleQuestion, Send, CheckCircle } from 'lucide-react';
import api from '../utils/api';
import { useUiLang } from '../hooks/useUiLang';

interface CompanyQuestion {
  id: number;
  productId: number;
  productName: string;
  userName: string;
  question: string;
  answer: string;
  isAnswered: boolean;
  createdAt: string;
}

interface CompanyQuestionsPanelProps {
  companyId: number;
  companyName?: string;
}

/**
 * Seller panel to answer customer questions about products.
 * Backend: GET /api/questions/company/:id, POST /api/questions/:id/answer.
 */
export default function CompanyQuestionsPanel({ companyId, companyName }: CompanyQuestionsPanelProps) {
  const [questions, setQuestions] = useState<CompanyQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyUnanswered, setOnlyUnanswered] = useState(true);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const lang = useUiLang();
  const L = lang === 'uz' ? {
    title: 'Xaridorlar savollari', onlyUn: 'Faqat javobsiz', loading: 'Yuklanmoqda...',
    noUn: 'Javobsiz savollar yoʻq 🎉', none: 'Hozircha savollar yoʻq', buyer: 'Xaridor',
    yourAnswer: 'Javobingiz...', answer: 'Javob berish', seller: 'Sotuvchi', saveFail: 'Javobni saqlab boʻlmadi',
  } : {
    title: 'Вопросы покупателей', onlyUn: 'Только без ответа', loading: 'Загрузка...',
    noUn: 'Нет неотвеченных вопросов 🎉', none: 'Вопросов пока нет', buyer: 'Покупатель',
    yourAnswer: 'Ваш ответ...', answer: 'Ответить', seller: 'Продавец', saveFail: 'Не удалось сохранить ответ',
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.productQuestions.listByCompany(companyId, onlyUnanswered);
      setQuestions(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Load questions failed:', e);
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, onlyUnanswered]);

  const submitAnswer = async (id: number) => {
    const answer = (drafts[id] || '').trim();
    if (!answer) return;
    setSavingId(id);
    try {
      await api.productQuestions.answer(id, { answer, answeredBy: companyName || L.seller });
      setDrafts((d) => ({ ...d, [id]: '' }));
      await load();
    } catch (e) {
      console.error('Answer failed:', e);
      alert(L.saveFail);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageCircleQuestion className="w-6 h-6 text-blue-600" />
          <h2 className="text-lg font-bold">{L.title}</h2>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={onlyUnanswered}
            onChange={(e) => setOnlyUnanswered(e.target.checked)}
          />
          {L.onlyUn}
        </label>
      </div>

      {loading ? (
        <p className="text-gray-400">{L.loading}</p>
      ) : questions.length === 0 ? (
        <p className="text-gray-400">{onlyUnanswered ? L.noUn : L.none}</p>
      ) : (
        <div className="space-y-3">
          {questions.map((q) => (
            <div key={q.id} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="text-xs text-gray-400 mb-1">
                {q.productName} · {q.userName || L.buyer} ·{' '}
                {q.createdAt ? new Date(q.createdAt).toLocaleDateString() : ''}
              </div>
              <p className="font-medium text-gray-900 mb-2">{q.question}</p>

              {q.isAnswered ? (
                <div className="flex gap-2 rounded-lg p-2 bg-green-50">
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-700">{q.answer}</p>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={drafts[q.id] || ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                    placeholder={L.yourAnswer}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && submitAnswer(q.id)}
                  />
                  <button
                    onClick={() => submitAnswer(q.id)}
                    disabled={savingId === q.id || !(drafts[q.id] || '').trim()}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50 active:scale-95"
                  >
                    <Send className="w-4 h-4" />
                    {L.answer}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
