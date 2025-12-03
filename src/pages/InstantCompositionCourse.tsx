import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, HelpCircle, Star, Award } from 'lucide-react'
import InstantCompositionStartModal from '../components/InstantCompositionStartModal'
import InstantCompositionSession from '../components/InstantCompositionSession'

// Dummy data - in a real app this would come from a store or API
const courses = {
  '1': {
    id: '1',
    title: '文法別 日常英会話 基礎編',
    lessonCount: 65,
    description: '中学の英文法を話せるようにするための教材です。焦らずに基礎を大切にして、一歩ずつ積み重ねていきましょう！',
    progress: 4,
    imageColor: '#e0f2f1',
    chapters: [
      {
        id: 'c1',
        title: 'Chapter 1',
        lessons: [
          {
            id: '1',
            title: '1. be 動詞',
            correct: 7,
            total: 10,
            time: '36.3秒',
            date: '2025年11月28日',
            count: 0,
            status: 'silver',
            questions: [
              { id: 'q1', japanese: 'もうすでに真夜中です。', english: "It's already midnight." },
              { id: 'q2', japanese: '外は晴れています。', english: "It's sunny outside." }
            ]
          },
          {
            id: '2',
            title: '2. 一般動詞',
            correct: 8,
            total: 10,
            time: '38.5秒',
            date: '2025年11月28日',
            count: 0,
            status: 'silver',
            questions: []
          },
          {
            id: '3',
            title: '3. 三単現の文',
            correct: 10,
            total: 10,
            time: '3分14.9秒',
            date: '2025年11月29日',
            count: 1,
            status: 'gold',
            questions: []
          },
          {
            id: '4',
            title: '4. SV',
            correct: 10,
            total: 10,
            time: '2分27.4秒',
            date: '2025年11月29日',
            count: 1,
            status: 'gold',
            questions: []
          }
        ]
      },
      { id: 'c2', title: 'Chapter 2', lessons: [] },
      { id: 'c3', title: 'Chapter 3', lessons: [] }
    ]
  }
}

export default function InstantCompositionCourse() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const course = courses[courseId as keyof typeof courses]

  const [selectedLesson, setSelectedLesson] = useState<any>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [sessionMode, setSessionMode] = useState<'ai' | 'typing' | null>(null)

  if (!course) return <div>Course not found</div>

  const handleLessonClick = (lesson: any) => {
    setSelectedLesson(lesson)
    setIsModalOpen(true)
  }

  const handleStartSession = (mode: 'ai' | 'typing') => {
    setSessionMode(mode)
    setIsModalOpen(false)
  }

  const handleCloseSession = () => {
    setSessionMode(null)
    setIsModalOpen(true)
  }

  return (
    <div className="page-screen">
      <header className="home-header">
        <button className="icon-button" onClick={() => navigate('/instant-composition')} style={{ width: 40, height: 40 }}>
          <ChevronLeft size={24} />
        </button>
        <div className="home-header__brand" style={{ fontSize: 16 }}></div>
        <button className="icon-button" aria-label="Help" style={{ width: 40, height: 40 }}>
          <HelpCircle size={20} />
        </button>
      </header>

      <div className="page-body" style={{ gap: 0 }}>
        <div className="course-header">
          <div className="course-header__image" style={{ backgroundColor: course.imageColor }}>
            {/* Image placeholder */}
          </div>
          <div className="course-header__info">
            <h1 className="course-header__title">{course.title}</h1>
            <p className="course-header__meta">[{course.lessonCount} lessons]</p>
            <p className="course-header__description">{course.description}</p>
          </div>
        </div>

        <div className="progress-section">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${(course.progress / course.lessonCount) * 100}%` }}
            />
          </div>
          <div className="progress-text">
            {course.progress}/{course.lessonCount}
          </div>
        </div>

        <div className="chapter-tabs">
          {course.chapters.map((chapter, index) => (
            <button
              key={chapter.id}
              className={`chapter-tab ${index === 0 ? 'chapter-tab--active' : ''}`}
            >
              {chapter.title}
            </button>
          ))}
        </div>

        <div className="chapter-content">
          <div className="chapter-message">
            定着させるためには<span className="highlight">何度も学習することが肝心</span>です。
            <br />
            少なくとも4周ほど学習するとより効果的です！
          </div>

          <h2 className="chapter-title">Chapter 1</h2>

          <div className="lesson-list">
            {course.chapters[0].lessons.map(lesson => (
              <div
                key={lesson.id}
                className="card lesson-card"
                onClick={() => handleLessonClick(lesson)}
              >
                <div className="lesson-card__icon">
                  {lesson.status === 'gold' ? (
                    <div className="badge-gold">
                      <span className="badge-text">10/10</span>
                      <span className="badge-sub">Full Score</span>
                    </div>
                  ) : (
                    <div className="badge-silver">
                      <Star size={20} fill="white" stroke="none" />
                      <span className="badge-sub">Level</span>
                    </div>
                  )}
                </div>
                <div className="lesson-card__content">
                  <h3 className="lesson-card__title">{lesson.title}</h3>
                  <p className="lesson-card__stats">
                    正答数 {lesson.correct}/{lesson.total} 合計時間 {lesson.time}
                  </p>
                  <p className="lesson-card__date">前回学習日 : {lesson.date}</p>
                </div>
                <div className="lesson-card__count">
                  {lesson.count} <span className="lesson-card__count-unit">回</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {selectedLesson && (
        <InstantCompositionStartModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          lesson={selectedLesson}
          onStart={handleStartSession}
        />
      )}

      {sessionMode && selectedLesson && (
        <InstantCompositionSession
          lesson={selectedLesson}
          mode={sessionMode}
          onClose={handleCloseSession}
        />
      )}

      <style>{`
        .course-header {
          padding: 16px;
          display: flex;
          gap: 16px;
        }
        .course-header__image {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          flex-shrink: 0;
          opacity: 0.9;
        }
        .course-header__info {
          flex: 1;
        }
        .course-header__title {
          font-size: 16px;
          font-weight: 700;
          margin: 0 0 4px;
          color: var(--fg);
        }
        .course-header__meta {
          font-size: 12px;
          color: var(--muted);
          margin: 0 0 8px;
        }
        .course-header__description {
          font-size: 12px;
          color: var(--muted);
          line-height: 1.5;
          margin: 0;
        }
        .progress-section {
          padding: 0 16px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .progress-bar {
          flex: 1;
          height: 8px;
          background: rgba(51, 65, 85, 0.5);
          border-radius: 4px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: var(--primary);
          border-radius: 4px;
        }
        .progress-text {
          font-size: 12px;
          font-weight: bold;
          color: var(--muted);
        }
        .chapter-tabs {
          display: flex;
          border-bottom: 1px solid rgba(51, 65, 85, 0.5);
          overflow-x: auto;
          padding: 0 16px;
        }
        .chapter-tab {
          padding: 12px 16px;
          background: none;
          border: none;
          font-size: 15px;
          color: var(--muted);
          cursor: pointer;
          white-space: nowrap;
          border-bottom: 2px solid transparent;
          font-weight: 600;
        }
        .chapter-tab--active {
          color: var(--primary);
          border-bottom-color: var(--primary);
        }
        .chapter-content {
          padding: 24px 16px;
        }
        .chapter-message {
          text-align: center;
          font-size: 12px;
          color: var(--muted);
          margin-bottom: 24px;
          line-height: 1.6;
        }
        .highlight {
          color: var(--primary);
          font-weight: bold;
        }
        .chapter-title {
          font-size: 16px;
          color: var(--muted);
          margin: 0 0 16px;
          font-weight: 600;
        }
        .lesson-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .lesson-card {
          display: flex;
          align-items: center;
          gap: 16px;
          cursor: pointer;
          transition: border-color 0.2s ease, transform 0.2s ease;
        }
        .lesson-card:active {
          transform: scale(0.98);
        }
        .lesson-card:hover {
          border-color: var(--primary);
        }
        .lesson-card__icon {
          width: 48px;
          height: 48px;
          flex-shrink: 0;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .badge-gold {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: 2px solid var(--primary);
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          color: var(--primary);
          background: rgba(56, 189, 248, 0.1);
        }
        .badge-silver {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(148, 163, 184, 0.2);
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          color: var(--muted);
        }
        .badge-text {
          font-size: 10px;
          font-weight: bold;
          line-height: 1;
        }
        .badge-sub {
          font-size: 8px;
          line-height: 1;
          margin-top: 2px;
        }
        .lesson-card__content {
          flex: 1;
        }
        .lesson-card__title {
          font-size: 14px;
          font-weight: bold;
          color: var(--fg);
          margin: 0 0 4px;
        }
        .lesson-card__stats {
          font-size: 12px;
          color: var(--muted);
          margin: 0 0 2px;
        }
        .lesson-card__date {
          font-size: 10px;
          color: var(--muted);
          margin: 0;
          opacity: 0.8;
        }
        .lesson-card__count {
          font-size: 14px;
          color: var(--muted);
          text-align: right;
        }
        .lesson-card__count-unit {
          font-size: 10px;
        }
      `}</style>
    </div>
  )
}
