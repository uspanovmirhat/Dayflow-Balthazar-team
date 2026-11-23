import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { User } from 'firebase/auth'
import {
  addDays, addHabitLog, archiveHabit, changeTaskStatus, createHabit, createTask, getDailyProgress,
  deleteHabit, deleteTask, getCalendarEventsForMonth, getDashboardSummary,
  getHabitAnalytics, getHabitLogs, getHabitStreak, getHabits, getTaskAnalytics,
  getTasks, getUserProfile, login, logout, register, removeHabitLog,
  requestPasswordReset, subscribeToAuthState, updateHabit, updateTask,
  updateUserProfileFields, randomHabitColor,
} from './backend'
import type { CalendarDay, Habit, HabitAnalytics, HabitInput, HabitLog, HabitSchedule, LocalDate, StreakSummary, Task, TaskAnalytics, UserProfile } from './backend'
import './App.css'

type Page = 'dashboard' | 'habits' | 'tasks' | 'calendar' | 'analytics' | 'profile'
type Notice = { kind: 'success' | 'error'; text: string } | null
type DailyHabitProgress = { value: number; target: number; completed: boolean }

const navItems: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Обзор', icon: '◫' }, { id: 'habits', label: 'Привычки', icon: '◉' },
  { id: 'tasks', label: 'Задачи', icon: '✓' }, { id: 'calendar', label: 'Календарь', icon: '▦' },
  { id: 'analytics', label: 'Аналитика', icon: '▥' }, { id: 'profile', label: 'Профиль и настройки', icon: '○' },
]

const todayAt = (timezone: string): LocalDate => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) as LocalDate
const dateLabel = (date: LocalDate, options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) => new Intl.DateTimeFormat('ru-RU', options).format(new Date(`${date}T12:00:00`))
const errorText = (error: unknown) => {
  if (!(error instanceof Error)) return 'Не удалось выполнить действие. Попробуйте ещё раз.'
  if (error.message === 'The requested operation cannot be completed in the current state.') {
    const cause = 'causeValue' in error ? error.causeValue : undefined
    const causeMessage = cause instanceof Error ? cause.message : ''
    return causeMessage
      ? `Действие сейчас недоступно: ${causeMessage}`
      : 'Действие сейчас недоступно: данные могли измениться. Обновите список и попробуйте ещё раз.'
  }
  return error.message
}
const quotes = [
  { text: '«Успех — это сумма небольших усилий, повторяемых изо дня в день».', author: 'Роберт Кольер' },
  { text: '«Путь в тысячу миль начинается с первого шага».', author: 'Лао-цзы' },
  { text: '«Дисциплина — это мост между целями и их достижением».', author: 'Джим Рон' },
]

function Icon({ children }: { children: ReactNode }) { return <span className="icon" aria-hidden="true">{children}</span> }

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [page, setPage] = useState<Page>('dashboard')
  const [habits, setHabits] = useState<Habit[]>([])
  const [habitCompletionOverrides, setHabitCompletionOverrides] = useState<Record<string, DailyHabitProgress>>({})
  const [pendingHabitIds, setPendingHabitIds] = useState<Record<string, boolean>>({})
  const [tasks, setTasks] = useState<Task[]>([])
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getDashboardSummary>> | null>(null)
  const [habitAnalytics, setHabitAnalytics] = useState<HabitAnalytics[]>([])
  const [taskAnalytics, setTaskAnalytics] = useState<TaskAnalytics | null>(null)
  const [calendar, setCalendar] = useState<CalendarDay[]>([])
  const [streaks, setStreaks] = useState<Record<string, StreakSummary>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [modal, setModal] = useState<'habit' | 'task' | null>(null)
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [search, setSearch] = useState('')
  const [calendarDate, setCalendarDate] = useState<LocalDate>(() => todayAt(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'))
  const calendarDateRef = useRef(calendarDate)
  const currentUid = useRef<string | null>(null)
  const refreshVersion = useRef(0)
  const pendingHabitToggles = useRef(new Set<string>())
  const pendingTaskToggles = useRef(new Set<string>())

  const refresh = useCallback(async (activeUser: User, showSpinner = true, savedMessage?: string) => {
    const version = ++refreshVersion.current
    if (showSpinner) setRefreshing(true)
    try {
      const nextProfile = await getUserProfile()
      const today = todayAt(nextProfile.timezone)
      const start = addDays(today, -6)
      const [nextHabits, nextTasks] = await Promise.all([getHabits(), getTasks()])
      if (currentUid.current !== activeUser.uid || refreshVersion.current !== version) return
      setProfile(nextProfile); setHabits(nextHabits); setTasks(nextTasks)

      const results = await Promise.allSettled([
        getDashboardSummary(today),
        getHabitAnalytics(start, today),
        getTaskAnalytics(start, today, today),
        getCalendarEventsForMonth(calendarDateRef.current),
        Promise.all(nextHabits.map(async (habit) => [habit.id, await getHabitStreak(habit.id, today)] as const)),
        Promise.allSettled(nextHabits.map(async (habit) => [habit.id, await getDailyProgress(habit.id, today)] as const)),
      ] as const)
      if (currentUid.current !== activeUser.uid || refreshVersion.current !== version) return

      const failedSections: string[] = []
      if (results[0].status === 'fulfilled') setSummary(results[0].value)
      else failedSections.push(`сводка дня: ${errorText(results[0].reason)}`)
      if (results[1].status === 'fulfilled') setHabitAnalytics(results[1].value)
      else failedSections.push(`аналитика привычек: ${errorText(results[1].reason)}`)
      if (results[2].status === 'fulfilled') setTaskAnalytics(results[2].value)
      else failedSections.push(`аналитика задач: ${errorText(results[2].reason)}`)
      if (results[3].status === 'fulfilled') setCalendar(results[3].value)
      else failedSections.push(`календарь: ${errorText(results[3].reason)}`)
      const streakResult = results[4]
      if (streakResult.status === 'fulfilled') setStreaks(Object.fromEntries(streakResult.value))
      else failedSections.push(`серии привычек: ${errorText(streakResult.reason)}`)
      const dailyProgressResult = results[5]
      if (dailyProgressResult.status === 'fulfilled') {
        const activeHabitIds = new Set(nextHabits.map((habit) => habit.id))
        setHabitCompletionOverrides((current) => {
          const reconciled = Object.fromEntries(Object.entries(current).filter(([habitId]) => activeHabitIds.has(habitId)))
          for (const result of dailyProgressResult.value) {
            if (result.status === 'fulfilled') reconciled[result.value[0]] = result.value[1]
          }
          return reconciled
        })
        const rejectedProgress = dailyProgressResult.value.find((result) => result.status === 'rejected')
        if (rejectedProgress?.status === 'rejected') failedSections.push(`состояние отдельной привычки: ${errorText(rejectedProgress.reason)}`)
      } else failedSections.push(`состояние привычек: ${errorText(dailyProgressResult.reason)}`)

      if (failedSections.length) {
        const message = `Не удалось обновить — ${failedSections.join('; ')}.`
        setNotice(savedMessage
          ? { kind: 'success', text: `${savedMessage}. ${message} Сохранённые изменения уже отображены.` }
          : { kind: 'error', text: message })
      } else if (!savedMessage) setNotice(null)
    } catch (error) {
      if (currentUid.current === activeUser.uid && refreshVersion.current === version) {
        setNotice(savedMessage
          ? { kind: 'success', text: `${savedMessage}. Сохранение выполнено, но основные данные не удалось обновить: ${errorText(error)}` }
          : { kind: 'error', text: errorText(error) })
      }
    }
    finally { if (refreshVersion.current === version) { setLoading(false); setRefreshing(false) } }
  }, [])

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    try {
      unsubscribe = subscribeToAuthState(async (nextUser) => {
        if (!active) return
        const previousUid = currentUid.current
        currentUid.current = nextUser?.uid ?? null
        setUser(nextUser)
        if (nextUser) {
          if (previousUid !== nextUser.uid) { setProfile(null); setHabits([]); setHabitCompletionOverrides({}); setTasks([]); setSummary(null); setHabitAnalytics([]); setTaskAnalytics(null); setCalendar([]); setStreaks({}) }
          setLoading(true); await refresh(nextUser, false)
        }
        else { setProfile(null); setHabits([]); setHabitCompletionOverrides({}); setTasks([]); setSummary(null); setLoading(false) }
      }, (error) => { if (active) { setNotice({ kind: 'error', text: error.message }); setLoading(false) } })
    } catch (error) { window.setTimeout(() => { if (active) { setNotice({ kind: 'error', text: errorText(error) }); setLoading(false) } }, 0) }
    return () => { active = false; unsubscribe?.() }
  }, [refresh])

  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(null), 4500); return () => window.clearTimeout(timer) }, [notice])

  const today = profile ? todayAt(profile.timezone) : todayAt('UTC')
  const visibleTasks = useMemo(() => tasks.filter((task) => `${task.title} ${task.description}`.toLowerCase().includes(search.toLowerCase())), [tasks, search])
  const visibleHabits = useMemo(() => habits.filter((habit) => `${habit.name} ${habit.description}`.toLowerCase().includes(search.toLowerCase())), [habits, search])
  const todaysHabits = useMemo(() => visibleHabits.filter((habit) => habitAnalytics.some((item) => item.habitId === habit.id && item.progress.some((day) => day.date === today))), [visibleHabits, habitAnalytics, today])
  const completedTasks = tasks.filter((task) => task.status === 'completed').length
  const allPlanned = (summary?.scheduledHabits ?? 0) + (summary?.tasksDue ?? 0)
  const allDone = (summary?.completedHabits ?? 0) + (summary?.completedTasksDue ?? 0)
  const progress = summary ? (allPlanned ? Math.round(allDone / allPlanned * 100) : 0) : null

  const afterMutation = (message: string) => {
    setNotice({ kind: 'success', text: message })
    if (user) void refresh(user, false, message)
  }
  const toggleHabit = async (habit: Habit, action: 'toggle' | 'increment' | 'undo' = 'toggle') => {
    if (pendingHabitToggles.current.has(habit.id)) return
    const previous = habitCompletionOverrides[habit.id]
    if (!previous) {
      setNotice({ kind: 'error', text: 'Сначала дождитесь загрузки прогресса привычки.' })
      return
    }
    const operation = habit.type === 'count'
      ? action === 'undo' || (action === 'toggle' && previous.completed) ? 'undo' : 'increment'
      : previous.completed ? 'undo' : 'increment'
    if (habit.type === 'count' && operation === 'increment' && previous.value >= previous.target) return
    if (habit.type === 'count' && operation === 'undo' && previous.value <= 0) return

    const optimistic = habit.type === 'count'
      ? { ...previous, value: Math.max(0, Math.min(previous.target, previous.value + (operation === 'increment' ? 1 : -1))), completed: operation === 'increment' ? previous.value + 1 >= previous.target : previous.value - 1 >= previous.target }
      : { value: operation === 'increment' ? 1 : 0, target: 1, completed: operation === 'increment' }
    setHabitCompletionOverrides((current) => ({ ...current, [habit.id]: optimistic }))
    pendingHabitToggles.current.add(habit.id)
    setPendingHabitIds((current) => ({ ...current, [habit.id]: true }))
    try {
      if (habit.type === 'count') {
        if (operation === 'undo') {
          const existing = await getHabitLogs(today, today, habit.id)
          const latest = [...existing].sort((left, right) => right.completedAt.toMillis() - left.completedAt.toMillis())[0]
          if (!latest) throw new Error('Не найдено выполнение для отмены. Обновите прогресс и попробуйте снова.')
          await removeHabitLog(habit.id, latest.id)
          const value = Math.max(0, previous.value - latest.value)
          setHabitCompletionOverrides((current) => ({ ...current, [habit.id]: { ...previous, value, completed: value >= previous.target } }))
          afterMutation('Одно выполнение отменено')
        } else {
          await addHabitLog(habit.id, { value: 1 })
          afterMutation(`Прогресс: ${optimistic.value} из ${optimistic.target}`)
        }
      } else {
        if (operation === 'undo') {
          const existing = await getHabitLogs(today, today, habit.id)
          if (!existing.length) throw new Error('Отметка не найдена. Обновите список и попробуйте снова.')
          await Promise.all(existing.map((log) => removeHabitLog(habit.id, log.id)))
          afterMutation('Отметка отменена')
        } else {
          await addHabitLog(habit.id)
          afterMutation('Привычка выполнена')
        }
      }
    } catch (error) {
      setHabitCompletionOverrides((current) => ({ ...current, [habit.id]: previous }))
      setNotice({ kind: 'error', text: errorText(error) })
    }
    finally {
      pendingHabitToggles.current.delete(habit.id)
      setPendingHabitIds((current) => ({ ...current, [habit.id]: false }))
    }
  }
  const toggleTask = async (task: Task) => {
    if (pendingTaskToggles.current.has(task.id)) return
    pendingTaskToggles.current.add(task.id)
    try {
      const updated = await changeTaskStatus(task.id, task.status === 'completed' ? 'todo' : 'completed')
      setTasks((current) => current.map((item) => item.id === updated.id ? updated : item))
      afterMutation(updated.status === 'completed' ? 'Задача выполнена' : 'Задача возвращена в список')
    }
    catch (error) { setNotice({ kind: 'error', text: errorText(error) }) }
    finally { pendingTaskToggles.current.delete(task.id) }
  }
  const showForm = (kind: 'habit' | 'task', item?: Habit | Task) => {
    setModal(kind)
    if (kind === 'habit') setEditingHabit(item as Habit | undefined ?? null)
    else setEditingTask(item as Task | undefined ?? null)
  }
  const changeCalendarMonth = (date: LocalDate) => { calendarDateRef.current = date; setCalendarDate(date); if (user) void refresh(user, false) }

  if (loading) return <div className="boot-screen"><span className="brand-mark">d</span><span className="loader" />Загружаем Dayflow</div>
  if (!user) return <AuthScreen notice={notice} onNotice={setNotice} />

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => setPage('dashboard')}><span className="brand-mark">d</span><span>dayflow</span></button>
      <div className="side-caption">МЕНЮ</div>
      <nav>{navItems.map((item) => <button key={item.id} className={`nav-link ${page === item.id ? 'active' : ''}`} onClick={() => setPage(item.id)}><Icon>{item.icon}</Icon>{item.label}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-note"><span>✦</span><strong>Маленькие шаги<br />ведут к большим целям</strong><small>Продолжайте в своём ритме</small></div><button className="nav-link" onClick={async () => { try { await logout() } catch (error) { setNotice({ kind: 'error', text: errorText(error) }) } }}><Icon>↪</Icon>Выйти</button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="mobile-brand" onClick={() => setPage('dashboard')}><span className="brand-mark">d</span>dayflow</button><label className="search-box"><Icon>⌕</Icon><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти задачу или привычку..." /></label><button className="primary-icon" aria-label="Добавить" onClick={() => showForm('task')}><span>＋</span></button><button className="avatar" onClick={() => setPage('profile')} title="Профиль">{profile?.displayName?.slice(0, 1).toUpperCase() || 'А'}</button></header>
      <div className="content-wrap">
        {notice && <div className={`toast ${notice.kind}`} role="status">{notice.text}<button onClick={() => setNotice(null)} aria-label="Закрыть">×</button></div>}
        {refreshing && <div className="sync-indicator"><span className="loader small" />Синхронизация данных</div>}
        {page === 'dashboard' && <Dashboard profile={profile} today={today} summary={summary} progress={progress} allPlanned={allPlanned} allDone={allDone} habits={todaysHabits} tasks={visibleTasks} streaks={streaks} analytics={habitAnalytics} completionOverrides={habitCompletionOverrides} pendingHabitIds={pendingHabitIds} onToggleHabit={toggleHabit} onToggleTask={toggleTask} onCreate={showForm} onNavigate={setPage} onEditHabit={(item) => showForm('habit', item)} onEditTask={(item) => showForm('task', item)} />}
        {page === 'habits' && <HabitsPage habits={visibleHabits} today={today} streaks={streaks} completionOverrides={habitCompletionOverrides} pendingHabitIds={pendingHabitIds} onAdd={() => showForm('habit')} onToggle={toggleHabit} onEdit={(item) => showForm('habit', item)} onArchive={async (item) => { if (!window.confirm(`Архивировать привычку «${item.name}»?`)) return; try { await archiveHabit(item.id); await afterMutation('Привычка архивирована') } catch (error) { setNotice({ kind: 'error', text: errorText(error) }) } }} onDelete={async (item) => { if (!window.confirm(`Удалить привычку «${item.name}» вместе с историей?`)) return; try { await deleteHabit(item.id); await afterMutation('Привычка удалена') } catch (error) { setNotice({ kind: 'error', text: errorText(error) }) } }} />}
        {page === 'tasks' && <TasksPage tasks={visibleTasks} onAdd={() => showForm('task')} onToggle={toggleTask} onEdit={(item) => showForm('task', item)} onDelete={async (item) => { if (!window.confirm(`Удалить задачу «${item.title}»?`)) return; try { await deleteTask(item.id); await afterMutation('Задача удалена') } catch (error) { setNotice({ kind: 'error', text: errorText(error) }) } }} />}
        {page === 'calendar' && <CalendarPage date={calendarDate} days={calendar} onChange={changeCalendarMonth} />}
        {page === 'analytics' && <AnalyticsPage habits={habitAnalytics} tasks={taskAnalytics} completedTasks={completedTasks} />}
        {page === 'profile' && profile && <ProfilePage profile={profile} onSave={async (fields) => { try { const next = await updateUserProfileFields(fields); setProfile(next); await afterMutation('Профиль обновлён') } catch (error) { setNotice({ kind: 'error', text: errorText(error) }) } }} onLogout={() => void logout()} />}
      </div>
      <nav className="mobile-nav" aria-label="Основная навигация">{navItems.map((item) => <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)}><Icon>{item.icon}</Icon><span>{item.id === 'profile' ? 'Профиль' : item.label}</span></button>)}</nav>
    </main>
    {modal && <ItemModal kind={modal} habit={editingHabit} task={editingTask} onClose={() => setModal(null)} onSave={async (data) => {
      try {
        if (modal === 'habit') {
          const input = data as HabitInput
          const savedHabit = editingHabit ? await updateHabit(editingHabit.id, input) : await createHabit(input)
          setHabits((current) => current.some((habit) => habit.id === savedHabit.id)
            ? current.map((habit) => habit.id === savedHabit.id ? savedHabit : habit)
            : [savedHabit, ...current])
          setModal(null)
          afterMutation(editingHabit ? 'Привычка обновлена' : 'Привычка добавлена')
        }
        else {
          const input = data as Parameters<typeof createTask>[0]
          const savedTask = editingTask ? await updateTask(editingTask.id, input) : await createTask(input)
          setTasks((current) => current.some((task) => task.id === savedTask.id)
            ? current.map((task) => task.id === savedTask.id ? savedTask : task)
            : [savedTask, ...current])
          setModal(null)
          afterMutation(editingTask ? 'Задача обновлена' : 'Задача добавлена')
        }
      } catch (error) { setNotice({ kind: 'error', text: errorText(error) }) }
    }} />}
  </div>
}

function AuthScreen({ notice, onNotice }: { notice: Notice; onNotice: (notice: Notice) => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login')
  const [busy, setBusy] = useState(false)
  const [values, setValues] = useState({ name: '', email: '', password: '' })
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); onNotice(null)
    try {
      if (mode === 'register') await register({ displayName: values.name, email: values.email, password: values.password })
      else if (mode === 'reset') { await requestPasswordReset(values.email); onNotice({ kind: 'success', text: 'Письмо для сброса пароля отправлено на вашу почту.' }) }
      else await login(values.email, values.password)
    } catch (error) { onNotice({ kind: 'error', text: errorText(error) }) }
    finally { setBusy(false) }
  }
  return <main className="auth-page"><div className="auth-decoration"><span className="orb orb-one" /><span className="orb orb-two" /><div className="auth-quote"><span>✦ МЫСЛЬ ДНЯ</span><p>«Успех — это сумма небольших усилий, повторяемых изо дня в день».</p><small>Роберт Кольер</small></div></div><section className="auth-panel"><div className="brand auth-brand"><span className="brand-mark">d</span><span>dayflow</span></div><div className="auth-form-wrap"><span className="eyebrow">ВАШЕ ПРОСТРАНСТВО ДЛЯ РОСТА</span><h1>{mode === 'register' ? 'Создайте аккаунт' : mode === 'reset' ? 'Восстановление пароля' : 'С возвращением!'}</h1><p className="muted">{mode === 'register' ? 'Начните путь к своим целям уже сегодня.' : mode === 'reset' ? 'Укажите email, и мы отправим ссылку для сброса.' : 'Войдите, чтобы продолжить свой путь.'}</p>{notice && <div className={`auth-alert ${notice.kind}`}>{notice.text}</div>}<form onSubmit={(event) => void submit(event)}>{mode === 'register' && <label>Ваше имя<input required maxLength={120} autoComplete="name" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} placeholder="Анна" /></label>}<label>Email<input required type="email" autoComplete="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} placeholder="you@example.com" /></label>{mode !== 'reset' && <label>Пароль<input required minLength={8} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={values.password} onChange={(e) => setValues({ ...values, password: e.target.value })} placeholder="Не менее 8 символов" /></label>}{mode === 'login' && <button className="text-action forgot" type="button" onClick={() => setMode('reset')}>Забыли пароль?</button>}<button className="button primary full" disabled={busy}>{busy ? 'Подождите…' : mode === 'register' ? 'Создать аккаунт' : mode === 'reset' ? 'Отправить ссылку' : 'Войти'}<span>→</span></button></form><p className="auth-switch">{mode === 'reset' ? <button className="text-action" onClick={() => setMode('login')}>← Вернуться ко входу</button> : <>{mode === 'register' ? 'Уже есть аккаунт?' : 'Впервые в Dayflow?'} <button className="text-action" onClick={() => setMode(mode === 'register' ? 'login' : 'register')}>{mode === 'register' ? 'Войти' : 'Создать аккаунт'}</button></>}</p></div><small className="auth-footer">Ваши цели. Ваш темп. Ваш Dayflow.</small></section></main>
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) { return <div className="page-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div>{action}</div> }
function Dashboard({ profile, today, summary, progress, allPlanned, allDone, habits, tasks, streaks, analytics, completionOverrides, pendingHabitIds, onToggleHabit, onToggleTask, onCreate, onNavigate, onEditHabit, onEditTask }: { profile: UserProfile | null; today: LocalDate; summary: Awaited<ReturnType<typeof getDashboardSummary>> | null; progress: number | null; allPlanned: number; allDone: number; habits: Habit[]; tasks: Task[]; streaks: Record<string, StreakSummary>; analytics: HabitAnalytics[]; completionOverrides: Record<string, DailyHabitProgress>; pendingHabitIds: Record<string, boolean>; onToggleHabit: (habit: Habit, action?: 'toggle' | 'increment' | 'undo') => void; onToggleTask: (task: Task) => void; onCreate: (kind: 'habit' | 'task') => void; onNavigate: (page: Page) => void; onEditHabit: (habit: Habit) => void; onEditTask: (task: Task) => void }) {
  const [quoteIndex, setQuoteIndex] = useState(0)
  const dated = dateLabel(today); const firstName = profile?.displayName?.split(' ')[0] || 'друг'
  const doneHabitIds = new Set(analytics.flatMap((habit) => habit.progress.some((d) => d.date === today && d.completed) ? [habit.habitId] : []))
  for (const [habitId, habitProgress] of Object.entries(completionOverrides)) {
    if (habitProgress.completed) doneHabitIds.add(habitId)
    else doneHabitIds.delete(habitId)
  }
  return <>
    <PageHeading eyebrow={dated.toLocaleUpperCase('ru-RU')} title={`Добро пожаловать, ${firstName}!`} subtitle="Хороший день, чтобы стать ещё немного продуктивнее." />
    <section className="card progress-card"><div className="card-head"><div><span className="section-label">ПРОГРЕСС СЕГОДНЯ</span><h2>{progress !== null && progress >= 100 ? 'Отличная работа!' : 'Продолжайте двигаться!'}</h2></div><button className="link-button" onClick={() => onNavigate('analytics')}>Подробнее <span>›</span></button></div><div className="progress-content"><div className="progress-ring" style={{ '--progress': `${progress ?? 0}%` } as CSSProperties}><div><strong>{progress === null ? '—' : `${progress}%`}</strong><span>выполнено</span></div></div><div className="progress-details"><p>{summary && allPlanned === 0 ? 'На сегодня запланированных дел нет.' : <>Вы завершили <strong>{summary ? `${allDone} из ${allPlanned}` : '— из —'}</strong> запланированных дел.</>}</p><div className="progress-breakdown"><span><i className="dot blue" /><strong>{summary ? summary.scheduledHabits ? `${summary.completedHabits}/${summary.scheduledHabits}` : '—' : '—/—'}</strong><small>Привычки</small></span><span><i className="dot pale" /><strong>{summary ? summary.tasksDue ? `${summary.completedTasksDue}/${summary.tasksDue}` : '—' : '—/—'}</strong><small>Задачи</small></span></div></div></div></section>
    <section className="quote-card"><div className="quote-top"><div className="quote-label">✦ <span>Мысль дня</span></div><button className="quote-change" onClick={() => setQuoteIndex((quoteIndex + 1) % quotes.length)} aria-label="Следующая мысль">⟳</button></div><blockquote>{quotes[quoteIndex].text}</blockquote><span className="quote-author">{quotes[quoteIndex].author}</span><div className="quote-rings" /></section>
    <div className="stat-grid"><StatCard icon="✓" label="Выполнено задач" value={String(tasks.filter((t) => t.status === 'completed').length)} sub="За всё время" onClick={() => onNavigate('tasks')} /><StatCard icon="↻" label="Лучшая серия" value={`${Math.max(0, ...Object.values(streaks).map((streak) => streak.longestStreak))} дней`} sub="За всё время" onClick={() => onNavigate('habits')} /><StatCard icon="▥" label="Продуктивность" value={progress === null ? '—' : `${progress}%`} sub="Сегодня" onClick={() => onNavigate('analytics')} /></div>
    <section className="card list-card"><div className="section-head"><div><h2>Привычки на сегодня</h2><p>{summary?.completedHabits ?? 0} из {summary?.scheduledHabits ?? 0} выполнено</p></div><button className="link-button" onClick={() => onNavigate('habits')}>Все привычки <span>›</span></button></div>{habits.length ? <div className="rows">{habits.slice(0, 5).map((habit, index) => <HabitRow key={habit.id} habit={habit} progress={completionOverrides[habit.id] ?? { value: doneHabitIds.has(habit.id) ? 1 : 0, target: habit.targetPerDay, completed: doneHabitIds.has(habit.id) }} ready={Boolean(completionOverrides[habit.id])} pending={Boolean(pendingHabitIds[habit.id])} streak={streaks[habit.id]?.currentStreak ?? 0} index={index} onAction={(action) => onToggleHabit(habit, action)} onEdit={() => onEditHabit(habit)} />)}</div> : <EmptyState title={habits.length === 0 && summary?.scheduledHabits === 0 ? 'Сегодня отдых' : 'Пока нет привычек'} text={summary?.scheduledHabits === 0 ? 'На сегодня запланированных привычек нет.' : 'Добавьте первую привычку и начните формировать полезный ритм.'} action={summary?.scheduledHabits === 0 ? undefined : 'Добавить привычку'} onClick={summary?.scheduledHabits === 0 ? undefined : () => onCreate('habit')} />}{habits.length > 0 && <button className="dashed-add" onClick={() => onCreate('habit')}>＋ <span>Добавить привычку</span></button>}</section>
    <section className="card list-card"><div className="section-head"><div><h2>Задачи на сегодня</h2><p>{summary?.completedTasksDue ?? 0} из {summary?.tasksDue ?? 0} выполнено</p></div><button className="link-button" onClick={() => onNavigate('tasks')}>Все задачи <span>›</span></button></div>{tasks.length ? <div className="rows">{tasks.filter((task) => !task.dueDate || task.dueDate === today).slice(0, 5).map((task) => <TaskRow key={task.id} task={task} onToggle={() => onToggleTask(task)} onEdit={() => onEditTask(task)} />)}</div> : <EmptyState title="На сегодня задач нет" text="Запишите важное дело, чтобы не забыть о нём." action="Добавить задачу" onClick={() => onCreate('task')} />}<button className="dashed-add" onClick={() => onCreate('task')}>＋ <span>Быстро добавить задачу</span></button></section>
    <ProductivityChart analytics={analytics} />
  </>
}
function StatCard({ icon, label, value, sub, onClick }: { icon: string; label: string; value: string; sub: string; onClick: () => void }) { return <button className="stat-card" onClick={onClick}><span className="stat-icon">{icon}</span><span className="stat-copy"><small>{label}</small><strong>{value}</strong><em>{sub}</em></span><span className="stat-chevron">›</span></button> }

const habitIcons = ['☼', '▤', '♧', '⌁', '◉', '✦']
function CountProgressControls({ progress, ready, pending, onIncrement, onUndo }: { progress: DailyHabitProgress; ready: boolean; pending: boolean; onIncrement: () => void; onUndo: () => void }) { return <div className="count-progress" aria-label={`Прогресс ${progress.value} из ${progress.target}`} aria-busy={pending}><strong>{pending ? 'Сохранение…' : `${progress.value}/${progress.target}`}</strong><button type="button" aria-label="Добавить выполнение" disabled={!ready || pending || progress.value >= progress.target} onClick={onIncrement}>＋</button><button type="button" aria-label="Отменить последнее выполнение" disabled={!ready || pending || progress.value <= 0} onClick={onUndo}>−</button></div> }
function HabitRow({ habit, progress, ready, pending, streak, index, onAction, onEdit }: { habit: Habit; progress: DailyHabitProgress; ready: boolean; pending: boolean; streak: number; index: number; onAction: (action: 'toggle' | 'increment' | 'undo') => void; onEdit: () => void }) { return <div className={`habit-row ${progress.completed ? 'is-done' : ''}`}><span className={`habit-icon icon-tone-${index % 4}`} style={{ color: habit.color, backgroundColor: `${habit.color}22` }}>{habitIcons[index % habitIcons.length]}</span><button className="row-main" onClick={onEdit}><strong>{habit.name}</strong><small>{habit.type === 'count' ? `Цель: ${progress.target} в день` : habit.description || 'Ежедневная привычка'}</small></button><span className="streak-label">🔥 {streak} дн.</span>{habit.type === 'count' ? <CountProgressControls progress={progress} ready={ready} pending={pending} onIncrement={() => onAction('increment')} onUndo={() => onAction('undo')} /> : <button className={`check-button ${progress.completed ? 'checked' : ''}`} style={progress.completed ? { borderColor: habit.color, backgroundColor: habit.color } : {}} disabled={!ready || pending} aria-busy={pending} onClick={() => onAction('toggle')} aria-label={pending ? 'Сохранение отметки' : progress.completed ? 'Отменить выполнение' : 'Отметить выполнение'}>{pending ? '…' : progress.completed ? '✓' : ''}</button>}</div> }
const priorities: Record<Task['priority'], string> = { high: 'Высокий', medium: 'Средний', low: 'Низкий' }
function TaskRow({ task, onToggle, onEdit }: { task: Task; onToggle: () => void; onEdit: () => void }) { return <div className={`task-row ${task.status === 'completed' ? 'is-done' : ''}`}><button className={`check-button task-check ${task.status === 'completed' ? 'checked' : ''}`} onClick={onToggle} aria-label="Изменить статус задачи">{task.status === 'completed' ? '✓' : ''}</button><button className="row-main" onClick={onEdit}><strong>{task.title}</strong><small><span>▢</span> {task.dueDate ? dateLabel(task.dueDate, { day: 'numeric', month: 'long' }) : 'Без срока'}{task.description && ` · ${task.description}`}</small></button><span className={`priority priority-${task.priority}`}>{priorities[task.priority]}</span></div> }
function EmptyState({ title, text, action, onClick }: { title: string; text: string; action?: string; onClick?: () => void }) { return <div className="empty-state"><span className="empty-icon">✦</span><strong>{title}</strong><p>{text}</p>{action && <button className="button secondary" onClick={onClick}>{action}</button>}</div> }

function HabitsPage({ habits, today, streaks, completionOverrides, pendingHabitIds, onAdd, onToggle, onEdit, onArchive, onDelete }: { habits: Habit[]; today: LocalDate; streaks: Record<string, StreakSummary>; completionOverrides: Record<string, DailyHabitProgress>; pendingHabitIds: Record<string, boolean>; onAdd: () => void; onToggle: (habit: Habit, action?: 'toggle' | 'increment' | 'undo') => void; onEdit: (habit: Habit) => void; onArchive: (habit: Habit) => void; onDelete: (habit: Habit) => void }) {
  const [dailyProgress, setDailyProgress] = useState<Record<string, DailyHabitProgress>>({})
  const [history, setHistory] = useState<HabitLog[]>([])
  const [progressError, setProgressError] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void Promise.allSettled(habits.map(async (habit) => [habit.id, await getDailyProgress(habit.id, today)] as const))
      .then((entries) => {
        if (!live) return
        setDailyProgress(Object.fromEntries(entries.flatMap((entry) => entry.status === 'fulfilled' ? [entry.value] : [])))
        const failed = entries.find((entry) => entry.status === 'rejected')
        setProgressError(failed?.status === 'rejected' ? errorText(failed.reason) : null)
      })
    void Promise.allSettled(habits.map((habit) => getHabitLogs(addDays(today, -29), today, habit.id)))
      .then((byHabit) => {
        if (!live) return
        setHistory(byHabit.flatMap((result) => result.status === 'fulfilled' ? result.value : []).sort((a, b) => b.date.localeCompare(a.date)))
        const failed = byHabit.find((result) => result.status === 'rejected')
        setHistoryError(failed?.status === 'rejected' ? errorText(failed.reason) : null)
      })
    return () => { live = false }
  }, [habits, today])
  return <>
    <PageHeading eyebrow="ВАШИ РИТУАЛЫ" title="Привычки" subtitle="Небольшие действия, которые меняют каждый день." action={<button className="button primary" onClick={onAdd}>＋ Новая привычка</button>} />
    {progressError && <div className="inline-error" role="alert">Не удалось загрузить текущий прогресс: {progressError}</div>}
    {historyError && <div className="inline-error" role="alert">Не удалось загрузить историю привычек: {historyError}</div>}
    {habits.length ? <section className="card list-card"><div className="section-head"><div><h2>Активные привычки</h2><p>{habits.length} в вашем расписании</p></div></div><div className="rows">{habits.map((habit, index) => { const progress = completionOverrides[habit.id] ?? dailyProgress[habit.id] ?? { value: 0, target: habit.targetPerDay, completed: false }; const ready = Boolean(completionOverrides[habit.id] ?? dailyProgress[habit.id]); const pending = Boolean(pendingHabitIds[habit.id]); return <div className="habit-row expanded" key={habit.id}><span className={`habit-icon icon-tone-${index % 4}`} style={{ color: habit.color, backgroundColor: `${habit.color}22` }}>{habitIcons[index % habitIcons.length]}</span><button className="row-main" onClick={() => onEdit(habit)}><strong>{habit.name}</strong><small>{habit.description || (habit.type === 'count' ? `Цель: ${progress.target} в день` : 'Ежедневно')}</small></button><span className="streak-label">🔥 {streaks[habit.id]?.currentStreak ?? 0} дн.</span>{habit.type === 'count' ? <CountProgressControls progress={progress} ready={ready} pending={pending} onIncrement={() => onToggle(habit, 'increment')} onUndo={() => onToggle(habit, 'undo')} /> : <button className={`check-button ${progress.completed ? 'checked' : ''}`} style={progress.completed ? { borderColor: habit.color, backgroundColor: habit.color } : {}} disabled={!ready || pending} aria-busy={pending} onClick={() => onToggle(habit, 'toggle')} aria-label={pending ? 'Сохранение отметки' : 'Отметить привычку'}>{pending ? '…' : progress.completed ? '✓' : ''}</button>}<div className="row-actions"><button onClick={() => onEdit(habit)}>Изменить</button><button onClick={() => onArchive(habit)}>В архив</button><button className="danger-text" onClick={() => onDelete(habit)}>Удалить</button></div></div> })}</div></section> : <section className="card"><EmptyState title="Создайте свою первую привычку" text="Выберите действие, которое хотите регулярно повторять." action="Добавить привычку" onClick={onAdd} /></section>}
    {!!habits.length && <section className="card list-card"><div className="section-head"><div><h2>Серии привычек</h2><p>Текущая и лучшая серия по каждому ритуалу</p></div></div><div className="rows">{habits.map((habit) => <div className="streak-row" key={habit.id}><span>🔥</span><strong>{habit.name}</strong><span>Сейчас <b>{streaks[habit.id]?.currentStreak ?? 0} дн.</b></span><span>Рекорд <b>{streaks[habit.id]?.longestStreak ?? 0} дн.</b></span></div>)}</div></section>}
    <section className="card list-card"><div className="section-head"><div><h2>История выполнения</h2><p>Последние 30 дней</p></div></div>{history.length ? <div className="rows">{history.slice(0, 24).map((log) => <div className="history-row" key={`${log.habitId}-${log.id}`}><span className="history-check">✓</span><strong>{habits.find((habit) => habit.id === log.habitId)?.name ?? 'Привычка'}</strong><small>{dateLabel(log.date, { day: 'numeric', month: 'long' })}</small><b>{log.value > 1 ? `+${log.value}` : 'Выполнено'}</b></div>)}</div> : <EmptyState title="Записей пока нет" text="Отмеченные привычки появятся здесь." />}</section>
  </>
}
function TasksPage({ tasks, onAdd, onToggle, onEdit, onDelete }: { tasks: Task[]; onAdd: () => void; onToggle: (task: Task) => void; onEdit: (task: Task) => void; onDelete: (task: Task) => void }) { const [filter, setFilter] = useState('all'); const sorted = [...tasks].filter((task) => filter === 'all' || (filter === 'active' ? task.status !== 'completed' : task.status === 'completed')).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')); return <><PageHeading eyebrow="ПЛАНЫ И ЦЕЛИ" title="Задачи" subtitle="Сосредоточьтесь на том, что важно сегодня." action={<button className="button primary" onClick={onAdd}>＋ Новая задача</button>} /><div className="filter-tabs">{[['all', 'Все задачи'], ['active', 'В работе'], ['done', 'Выполненные']].map(([id, label]) => <button className={filter === id ? 'selected' : ''} key={id} onClick={() => setFilter(id)}>{label}</button>)}</div><section className="card list-card">{sorted.length ? <div className="rows">{sorted.map((task) => <div className="task-row expanded" key={task.id}><button className={`check-button task-check ${task.status === 'completed' ? 'checked' : ''}`} onClick={() => onToggle(task)}>{task.status === 'completed' ? '✓' : ''}</button><button className="row-main" onClick={() => onEdit(task)}><strong>{task.title}</strong><small>{task.dueDate ? `▢ ${dateLabel(task.dueDate, { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Без срока'}{task.description && ` · ${task.description}`}</small></button><span className={`priority priority-${task.priority}`}>{priorities[task.priority]}</span><div className="row-actions"><button onClick={() => onEdit(task)}>Изменить</button><button className="danger-text" onClick={() => onDelete(task)}>Удалить</button></div></div>)}</div> : <EmptyState title="Здесь пока пусто" text="Добавьте задачу или измените фильтр." action="Добавить задачу" onClick={onAdd} />}</section></> }

function CalendarPage({ date, days, onChange }: { date: LocalDate; days: CalendarDay[]; onChange: (date: LocalDate) => void }) {
  const [selected, setSelected] = useState<LocalDate>(date)
  const [year, month] = date.split('-').map(Number)
  const first = new Date(year, month - 1, 1)
  const offset = (first.getDay() + 6) % 7
  const count = new Date(year, month, 0).getDate()
  const cells = [...Array(offset).fill(null), ...Array.from({ length: count }, (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}` as LocalDate)]
  const eventMap = new Map(days.map((day) => [day.date, day.events]))
  const selectedEvents = eventMap.get(selected) ?? []
  const stepMonth = (amount: number) => { const next = new Date(year, month - 1 + amount, 1); const local = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01` as LocalDate; onChange(local); setSelected(local) }
  return <><PageHeading eyebrow="ВАШ РИТМ" title="Календарь" subtitle="Задачи и привычки в одном расписании." /><section className="card calendar-card"><div className="calendar-head"><button className="round-action" onClick={() => stepMonth(-1)}>‹</button><h2>{dateLabel(date, { month: 'long', year: 'numeric' })}</h2><button className="round-action" onClick={() => stepMonth(1)}>›</button></div><div className="calendar-grid weekday-grid">{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{cells.map((day, i) => day ? <button key={day} className={`calendar-day ${day === selected ? 'selected' : ''} ${day === todayAt(Intl.DateTimeFormat().resolvedOptions().timeZone) ? 'today' : ''}`} onClick={() => setSelected(day)}><span>{Number(day.slice(-2))}</span>{eventMap.get(day)?.slice(0, 3).map((event, index) => <i key={`${event.kind}-${event.id}`} style={{ backgroundColor: event.kind === 'habit' ? event.color : '#91afc9', left: `calc(50% + ${(index - ((Math.min(eventMap.get(day)?.length ?? 0, 3) - 1) / 2)) * 6}px)` }} />)}</button> : <span key={`blank-${i}`} />)}</div><div className="calendar-legend"><span><i className="blue-dot" />События</span><span><i className="today-dot" />Сегодня</span></div></section><section className="card list-card"><div className="section-head"><div><h2>{dateLabel(selected)}</h2><p>{selectedEvents.length ? `${selectedEvents.length} события` : 'План на этот день'}</p></div></div>{selectedEvents.length ? <div className="rows">{selectedEvents.map((event) => <div className="calendar-event" key={`${event.kind}-${event.id}`}><span className="event-kind" style={event.kind === 'habit' ? { color: event.color, backgroundColor: `${event.color}22` } : {}}>{event.kind === 'habit' ? '◉' : '✓'}</span><span><strong>{event.title}</strong><small>{event.kind === 'habit' ? event.completed ? 'Выполнено' : 'Привычка' : priorities[event.priority]}</small></span>{event.kind === 'habit' && <span className={`check-button ${event.completed ? 'checked' : ''}`} style={event.completed ? { borderColor: event.color, backgroundColor: event.color } : {}}>{event.completed ? '✓' : ''}</span>}</div>)}</div> : <EmptyState title="На эту дату событий нет" text="Привычки и задачи появятся здесь." />}</section></>
}

function ProductivityChart({ analytics }: { analytics: HabitAnalytics[] }) { const rows = Array.from({ length: 7 }, (_, i) => { const date = addDays(todayAt(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'), i - 6); const scheduled = analytics.flatMap((habit) => habit.progress).filter((item) => item.date === date); return { date, value: scheduled.length ? Math.round(scheduled.filter((item) => item.completed).length / scheduled.length * 100) : 0 } }); const points = rows.map((row, index) => `${40 + index * 145},${180 - row.value * 1.35}`).join(' '); const average = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.value, 0) / rows.length) : 0; return <section className="card chart-card"><div className="section-head"><div><h2>Продуктивность</h2><p>Динамика за последние семь дней</p></div><strong className="chart-average">{average}% <small>в среднем</small></strong></div><div className="chart-wrap"><svg viewBox="0 0 920 230" preserveAspectRatio="none" role="img" aria-label="График продуктивности за семь дней"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#9bbbd5" stopOpacity=".28" /><stop offset="1" stopColor="#9bbbd5" stopOpacity=".04" /></linearGradient></defs>{[30, 90, 150, 210].map((y) => <line key={y} x1="30" x2="890" y1={y} y2={y} className="chart-gridline" />)}<polygon points={`40,210 ${points} 910,210`} fill="url(#chartFill)" /><polyline points={points} className="chart-line" />{rows.map((row, i) => <circle key={row.date} cx={40 + i * 145} cy={180 - row.value * 1.35} r="5" className="chart-point" />)}</svg><div className="chart-labels">{rows.map((row) => <span key={row.date}>{dateLabel(row.date, { weekday: 'short' }).replace('.', '')}</span>)}</div></div></section> }
function AnalyticsPage({ habits, tasks, completedTasks }: { habits: HabitAnalytics[]; tasks: TaskAnalytics | null; completedTasks: number }) { return <><PageHeading eyebrow="ВАШ ПРОГРЕСС" title="Аналитика" subtitle="Смотрите, как последовательность превращается в результат." /><ProductivityChart analytics={habits} /><div className="analytics-grid"><section className="card analytics-card"><span className="section-label">ЗАДАЧИ</span><strong className="big-number">{tasks?.completionRate ?? 0}%</strong><p>Доля выполненных задач за последние 7 дней</p><div className="metric-pair"><span><small>Выполнено</small><b>{tasks?.completedTasks ?? 0}</b></span><span><small>В работе</small><b>{tasks?.pendingTasks ?? 0}</b></span><span><small>Просрочено</small><b>{tasks?.overdueTasks ?? 0}</b></span></div></section><section className="card analytics-card"><span className="section-label">ПРИВЫЧКИ</span><h2>Ваши ритуалы</h2>{habits.length ? habits.map((habit) => <div className="analytics-habit" key={habit.habitId}><div><strong>{habit.name}</strong><small>{habit.completedDays} из {habit.scheduledDays} дней</small></div><b>{habit.completionRate}%</b><div className="mini-progress"><i style={{ width: `${habit.completionRate}%` }} /></div></div>) : <p>Данные появятся после выполнения привычек.</p>}</section><section className="card analytics-card"><span className="section-label">ВСЁ ВРЕМЯ</span><h2>Ваш путь</h2><div className="metric-pair"><span><small>Выполнено задач</small><b>{completedTasks}</b></span><span><small>Активных привычек</small><b>{habits.length}</b></span></div></section></div></> }

function ProfilePage({ profile, onSave, onLogout }: { profile: UserProfile; onSave: (fields: { displayName?: string; timezone?: string }) => Promise<void>; onLogout: () => void }) { const [name, setName] = useState(profile.displayName); const [timezone, setTimezone] = useState(profile.timezone); const zones = ['Asia/Qyzylorda', 'Asia/Almaty', 'Europe/Moscow', 'Europe/London', 'America/New_York', 'UTC']; return <><PageHeading eyebrow="ВАШ АККАУНТ" title="Профиль и настройки" subtitle="Настройте Dayflow под свой ритм." /><section className="card profile-card"><div className="profile-avatar">{profile.displayName.slice(0, 1).toUpperCase()}</div><div><h2>{profile.displayName}</h2><p>{profile.email}</p></div></section><form className="card settings-form" onSubmit={(event) => { event.preventDefault(); void onSave({ displayName: name, timezone }) }}><span className="section-label">ЛИЧНАЯ ИНФОРМАЦИЯ</span><label>Имя<input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label><label>Email<input disabled value={profile.email} /></label><label>Часовой пояс<select value={timezone} onChange={(e) => setTimezone(e.target.value)}>{[...new Set([...zones, timezone])].map((zone) => <option key={zone}>{zone}</option>)}</select><small>Используется для дат задач и отметок привычек.</small></label><button className="button primary">Сохранить изменения</button></form><section className="card settings-form"><span className="section-label">АККАУНТ</span><p className="muted">Выйдите из аккаунта на этом устройстве.</p><button className="button secondary" onClick={onLogout}>Выйти из аккаунта</button></section></> }

function hexToRgb(hex: string) { const value = hex.replace('#', ''); return { r: Number.parseInt(value.slice(0, 2), 16), g: Number.parseInt(value.slice(2, 4), 16), b: Number.parseInt(value.slice(4, 6), 16) } }
function rgbToHex(r: number, g: number, b: number) { return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')}`.toUpperCase() }
function rgbToHsv({ r, g, b }: ReturnType<typeof hexToRgb>) {
  const red = r / 255; const green = g / 255; const blue = b / 255
  const max = Math.max(red, green, blue); const min = Math.min(red, green, blue); const delta = max - min
  let hue = 0
  if (delta) hue = max === red ? ((green - blue) / delta) % 6 : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4
  hue = (hue * 60 + 360) % 360
  return { hue, saturation: max === 0 ? 0 : delta / max, value: max }
}
function hsvToHex(hue: number, saturation: number, value: number) {
  const chroma = value * saturation; const sector = hue / 60; const secondary = chroma * (1 - Math.abs(sector % 2 - 1)); const offset = value - chroma
  const rgb = sector < 1 ? [chroma, secondary, 0] : sector < 2 ? [secondary, chroma, 0] : sector < 3 ? [0, chroma, secondary] : sector < 4 ? [0, secondary, chroma] : sector < 5 ? [secondary, 0, chroma] : [chroma, 0, secondary]
  return rgbToHex(...rgb.map((channel) => (channel + offset) * 255) as [number, number, number])
}

function HabitColorPicker({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false)
  const [hexDraft, setHexDraft] = useState(color)
  const rgb = hexToRgb(color)
  const hsv = rgbToHsv(rgb)
  const emitColor = (nextColor: string) => { setHexDraft(nextColor); onChange(nextColor) }
  const changeAtPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const saturation = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
    const value = 1 - Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
    emitColor(hsvToHex(hsv.hue, saturation, value))
  }
  const setChannel = (channel: 'r' | 'g' | 'b', value: number) => emitColor(rgbToHex(channel === 'r' ? value : rgb.r, channel === 'g' ? value : rgb.g, channel === 'b' ? value : rgb.b))
  return <div className="habit-color-picker">
    <div className="color-picker-trigger"><span className="color-picker-label">Цвет привычки</span><span className="color-picker-actions"><button type="button" className="color-swatch" style={{ backgroundColor: color }} aria-label={`Выбран цвет ${color}; открыть палитру`} onClick={() => setOpen((value) => !value)} /><code>{color}</code><button type="button" className="random-color-button" onClick={() => emitColor(randomHabitColor())}>⟳ Random</button></span></div>
    {open && <div className="color-picker-panel">
      <div className="sv-picker" role="slider" aria-label="Насыщенность и яркость" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hsv.value * 100)} aria-valuetext={color} tabIndex={0} style={{ backgroundColor: `hsl(${hsv.hue} 100% 50%)` }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); changeAtPoint(event) }} onPointerMove={(event) => { if (event.buttons === 1) changeAtPoint(event) }} onKeyDown={(event) => { if (event.key.startsWith('Arrow')) { event.preventDefault(); emitColor(hsvToHex(hsv.hue, Math.max(0, Math.min(1, hsv.saturation + (event.key === 'ArrowRight' ? 0.04 : event.key === 'ArrowLeft' ? -0.04 : 0))), Math.max(0, Math.min(1, hsv.value + (event.key === 'ArrowUp' ? 0.04 : event.key === 'ArrowDown' ? -0.04 : 0))))) } }}><span className="sv-picker-cursor" style={{ left: `${hsv.saturation * 100}%`, top: `${(1 - hsv.value) * 100}%` }} /></div>
      <input className="hue-slider" aria-label="Оттенок" type="range" min={0} max={359} value={Math.round(hsv.hue)} onChange={(event) => emitColor(hsvToHex(Number(event.target.value), hsv.saturation, hsv.value))} />
      <div className="color-input-grid"><label>HEX<input aria-label="HEX цвет" value={hexDraft} onChange={(event) => { const value = event.target.value.toUpperCase(); setHexDraft(value); if (/^#[\da-f]{6}$/i.test(value)) emitColor(value) }} onBlur={() => setHexDraft(color)} maxLength={7} spellCheck={false} /></label>{(['r', 'g', 'b'] as const).map((channel) => <label key={channel}>{channel.toUpperCase()}<input aria-label={`RGB ${channel.toUpperCase()}`} type="number" min={0} max={255} value={rgb[channel]} onChange={(event) => setChannel(channel, Number(event.target.value))} /></label>)}</div>
      <div className="color-preview"><span style={{ backgroundColor: color }} /><span>Предпросмотр</span><code>{color}</code></div>
    </div>}
  </div>
}

function ItemModal({ kind, habit, task, onClose, onSave }: { kind: 'habit' | 'task'; habit: Habit | null; task: Task | null; onClose: () => void; onSave: (data: HabitInput | Parameters<typeof createTask>[0]) => Promise<void> }) {
  const [name, setName] = useState(kind === 'habit' ? habit?.name ?? '' : task?.title ?? '')
  const [description, setDescription] = useState(kind === 'habit' ? habit?.description ?? '' : task?.description ?? '')
  const [count, setCount] = useState(kind === 'habit' ? habit?.targetPerDay ?? 1 : 1)
  const currentInterval = habit?.schedule.type === 'interval' ? habit.schedule.everyNDays : null
  const [intervalEnabled, setIntervalEnabled] = useState(currentInterval !== null)
  const [intervalDays, setIntervalDays] = useState(currentInterval ?? 2)
  const [color, setColor] = useState(() => habit?.color ?? randomHabitColor())
  const [type, setType] = useState<'boolean' | 'count'>(habit?.type ?? 'boolean')
  const [priority, setPriority] = useState<Task['priority']>(task?.priority ?? 'medium')
  const [dueDate, setDueDate] = useState<LocalDate | ''>(task?.dueDate ?? todayAt(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'))
  const [busy, setBusy] = useState(false)
  const isHabit = kind === 'habit'
  const intervalUnit = intervalDays % 10 === 1 && intervalDays % 100 !== 11 ? 'день' : intervalDays % 10 >= 2 && intervalDays % 10 <= 4 && (intervalDays % 100 < 12 || intervalDays % 100 > 14) ? 'дня' : 'дней'
  const intervalDescription = intervalDays === 1 ? 'ежедневно' : intervalDays === 2 ? 'через день' : intervalDays === 7 ? 'раз в неделю' : intervalDays === 14 ? 'раз в две недели' : intervalDays === 30 ? 'примерно раз в месяц' : intervalDays === 90 ? 'примерно раз в квартал' : `каждые ${intervalDays} ${intervalDays % 10 === 1 && intervalDays % 100 !== 11 ? 'день' : intervalDays % 10 >= 2 && intervalDays % 10 <= 4 && (intervalDays % 100 < 12 || intervalDays % 100 > 14) ? 'дня' : 'дней'}`
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (isHabit && intervalEnabled && (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365)) return
    setBusy(true)
    try {
      if (isHabit) {
        const schedule: HabitSchedule = intervalEnabled
          ? { type: 'interval', everyNDays: intervalDays, startDate: habit?.schedule.type === 'interval' ? habit.schedule.startDate : todayAt(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') }
          : habit && habit.schedule.type !== 'interval' ? habit.schedule : { type: 'daily' }
        await onSave({ name, description, type, targetPerDay: type === 'boolean' ? 1 : count, schedule, color })
      } else await onSave({ title: name, description, priority, dueDate: dueDate || null })
    } finally { setBusy(false) }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><form className="modal" onSubmit={(event) => void submit(event)}>
    <div className="modal-head"><div><span className="eyebrow">{isHabit ? 'ПОЛЕЗНЫЙ РИТУАЛ' : 'НОВОЕ ДЕЛО'}</span><h2>{isHabit ? habit ? 'Изменить привычку' : 'Новая привычка' : task ? 'Изменить задачу' : 'Новая задача'}</h2></div><button type="button" className="close-button" onClick={onClose}>×</button></div>
    <label>{isHabit ? 'Название привычки' : 'Название задачи'}<input required maxLength={120} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={isHabit ? 'Например, утренняя медитация' : 'Что нужно сделать?'} /></label>
    <label>Описание <span className="optional">необязательно</span><textarea maxLength={500} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Добавьте детали" /></label>
    {isHabit ? <><label>Тип привычки<select value={type} disabled={Boolean(habit)} onChange={(e) => setType(e.target.value as typeof type)}><option value="boolean">Отметка выполнения</option><option value="count">Количество за день</option></select></label>
      <HabitColorPicker color={color} onChange={setColor} />
      {type === 'count' && <label>Цель на день<input required type="number" min={1} max={1000000} value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>}
      <label className="interval-toggle"><input type="checkbox" checked={intervalEnabled} onChange={(e) => setIntervalEnabled(e.target.checked)} />Задать интервал выполнения</label>
      {intervalEnabled && <div className="interval-control"><span>Выполнять каждые</span><input aria-label="Интервал в днях" required type="number" min={1} max={365} step={1} value={intervalDays} onChange={(e) => setIntervalDays(e.target.value === '' ? 0 : Number(e.target.value))} /><span>{intervalUnit}</span><small>{intervalDays >= 1 && intervalDays <= 365 ? intervalDescription : 'Введите число от 1 до 365'}</small></div>}
      </> : <><label>Срок выполнения<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value as LocalDate | '')} /></label><label>Приоритет<select value={priority} onChange={(e) => setPriority(e.target.value as Task['priority'])}><option value="high">Высокий</option><option value="medium">Средний</option><option value="low">Низкий</option></select></label></>}
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Отмена</button><button className="button primary" disabled={busy}>{busy ? 'Сохранение…' : 'Сохранить'}</button></div>
  </form></div>
}

export default App
