import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, ChevronRight, Star, Clock } from 'lucide-react'

// Dummy data
const courses = [
  {
    id: '1',
    title: '文法別 日常英会話 基礎編',
    level: 'Beginner',
    lessonCount: 65,
    completedCount: 4,
    description: '中学の英文法を話せるようにするための教材です。',
    category: 'daily',
    imageColor: '#e0f2f1'
  },
  {
    id: '2',
    title: '文法別 日常英会話 応用編',
    level: 'Intermediate',
    lessonCount: 50,
    completedCount: 0,
    description: '高校レベルの英文法を使って表現の幅を広げます。',
    category: 'daily',
    imageColor: '#fff3e0'
  },
  {
    id: '3',
    title: 'ビジネス英会話 入門',
    level: 'Beginner',
    lessonCount: 40,
    completedCount: 0,
    description: 'ビジネスシーンで頻出の基本フレーズをマスターします。',
    category: 'business',
    imageColor: '#e8eaf6'
  }
]

export default function InstantComposition() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'all' | 'business' | 'daily'>('all')

  const filteredCourses = courses.filter(course => {
    if (activeTab === 'all') return true
    return course.category === activeTab
  })

  return (
    <div className="page-screen">
      <header className="home-header">
        <div className="home-header__brand">Instant Composition</div>
      </header>

      <div className="page-body">
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'all' ? 'tab--active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            すべて
          </button>
          <button
            className={`tab ${activeTab === 'business' ? 'tab--active' : ''}`}
            onClick={() => setActiveTab('business')}
          >
            ビジネス
          </button>
          <button
            className={`tab ${activeTab === 'daily' ? 'tab--active' : ''}`}
            onClick={() => setActiveTab('daily')}
          >
            日常会話
          </button>
        </div>

        <div className="course-list">
          {filteredCourses.map(course => (
            <div
              key={course.id}
              className="card course-card"
              onClick={() => navigate(`/instant-composition/${course.id}`)}
            >
              <div className="course-card__image" style={{ backgroundColor: course.imageColor }}>
                <BookOpen size={32} color="#555" />
              </div>
              <div className="course-card__content">
                <div className="course-card__header">
                  <h3 className="course-card__title">{course.title}</h3>
                  <span className="course-card__level">{course.level}</span>
                </div>
                <p className="course-card__description">{course.description}</p>
                <div className="course-card__footer">
                  <div className="course-card__stats">
                    <Clock size={14} />
                    <span>{course.completedCount}/{course.lessonCount} lessons</span>
                  </div>
                  <ChevronRight size={20} className="course-card__arrow" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .tabs {
          display: flex;
          gap: 8px;
          padding: 4px;
          background: rgba(30, 41, 59, 0.5);
          border-radius: 12px;
          margin-bottom: 16px;
        }
        .tab {
          flex: 1;
          padding: 10px 16px;
          border: none;
          background: transparent;
          color: var(--muted);
          font-weight: 600;
          font-size: 14px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .tab--active {
          background: var(--primary);
          color: #0f172a;
        }
        .course-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .course-card {
          display: flex;
          gap: 16px;
          cursor: pointer;
          transition: transform 0.2s ease, border-color 0.2s ease;
          align-items: center;
        }
        .course-card:active {
          transform: scale(0.98);
        }
        .course-card:hover {
          border-color: var(--primary);
        }
        .course-card__image {
          width: 64px;
          height: 64px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          opacity: 0.9;
        }
        .course-card__content {
          flex: 1;
          min-width: 0;
        }
        .course-card__header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 4px;
        }
        .course-card__title {
          font-size: 16px;
          font-weight: 700;
          color: var(--fg);
          margin: 0;
          line-height: 1.4;
        }
        .course-card__level {
          font-size: 11px;
          padding: 2px 8px;
          background: rgba(148, 163, 184, 0.2);
          color: var(--muted);
          border-radius: 999px;
          white-space: nowrap;
          margin-left: 8px;
        }
        .course-card__description {
          font-size: 13px;
          color: var(--muted);
          margin: 0 0 8px;
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .course-card__footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .course-card__stats {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: var(--muted);
        }
        .course-card__arrow {
          color: var(--muted);
        }
      `}</style>
    </div>
  )
}
