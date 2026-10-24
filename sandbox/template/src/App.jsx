import { useMemo, useState } from 'react'
import './App.css'

const starterTasks = [
  { id: 1, title: 'Plan the week', done: false },
  { id: 2, title: 'Make time for a break', done: true },
]

function App() {
  const [tasks, setTasks] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('daylight-tasks') || 'null')
      return Array.isArray(saved) ? saved : starterTasks
    } catch {
      return starterTasks
    }
  })
  const [draft, setDraft] = useState('')
  const [filter, setFilter] = useState('all')

  const saveTasks = (nextTasks) => {
    setTasks(nextTasks)
    try {
      localStorage.setItem('daylight-tasks', JSON.stringify(nextTasks))
    } catch {
      // Keep the task list usable for this session when browser storage is disabled.
    }
  }

  const visibleTasks = useMemo(() => {
    if (filter === 'active') return tasks.filter((task) => !task.done)
    if (filter === 'completed') return tasks.filter((task) => task.done)
    return tasks
  }, [filter, tasks])

  const addTask = (event) => {
    event.preventDefault()
    const title = draft.trim()
    if (!title) return
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
    saveTasks([{ id, title, done: false }, ...tasks])
    setDraft('')
  }

  const toggleTask = (id) => saveTasks(tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task))
  const deleteTask = (id) => saveTasks(tasks.filter((task) => task.id !== id))
  const clearCompleted = () => saveTasks(tasks.filter((task) => !task.done))
  const remaining = tasks.filter((task) => !task.done).length

  return (
    <main className="page-shell">
      <section className="todo-card" aria-labelledby="page-title">
        <header className="page-header">
          <div>
            <p className="eyebrow">A LITTLE MORE FOCUS</p>
            <h1 id="page-title">Your day, <span>in order.</span></h1>
            <p className="subtitle">Capture what matters. Make room for what’s next.</p>
          </div>
          <div className="date-pill"><span className="date-dot" /> TODAY</div>
        </header>

        <form className="task-form" onSubmit={addTask}>
          <label className="sr-only" htmlFor="new-task">Add a task</label>
          <input id="new-task" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="What needs to get done?" maxLength={120} />
          <button type="submit" disabled={!draft.trim()}>Add task <span aria-hidden="true">+</span></button>
        </form>

        <div className="list-toolbar">
          <div className="filters" role="group" aria-label="Filter tasks">
            {[['all', 'All'], ['active', 'To do'], ['completed', 'Done']].map(([value, label]) => (
              <button key={value} type="button" className={filter === value ? 'filter active' : 'filter'} onClick={() => setFilter(value)} aria-pressed={filter === value}>{label}</button>
            ))}
          </div>
          <span className="task-count">{remaining} {remaining === 1 ? 'task' : 'tasks'} left</span>
        </div>

        <ul className="task-list">
          {visibleTasks.map((task) => (
            <li className={task.done ? 'task done' : 'task'} key={task.id}>
              <button className="check-button" type="button" onClick={() => toggleTask(task.id)} aria-label={task.done ? `Mark ${task.title} as to do` : `Complete ${task.title}`} aria-pressed={task.done}>
                {task.done && <span aria-hidden="true">✓</span>}
              </button>
              <span className="task-title">{task.title}</span>
              <button className="delete-button" type="button" onClick={() => deleteTask(task.id)} aria-label={`Delete ${task.title}`}>×</button>
            </li>
          ))}
        </ul>

        {visibleTasks.length === 0 && <div className="empty-state"><span aria-hidden="true">✦</span><p>{tasks.length ? 'Nothing in this view.' : 'A fresh page. Add your first task above.'}</p></div>}

        {tasks.some((task) => task.done) && <footer className="list-footer"><span>Small steps count.</span><button type="button" onClick={clearCompleted}>Clear completed</button></footer>}
      </section>
      <p className="page-note">Your tasks stay on this device.</p>
    </main>
  )
}

export default App
