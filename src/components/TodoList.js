import React from "react"
import TodoItem from "./TodoItem"
import { Consumer } from "../context"

const TodoList = () => (
  <Consumer>
    {app => (
      <ul className="todo-list">
        {app.data.filtered_todos.map(todo => (
          <TodoItem
            key={todo.id}
            todo={todo}
            editTodo={app.state.addByListener("EditingTodo")}
            deleteTodo={app.state.addByListener("DeletingTodo")}
            completeTodo={app.state.addByListener("CompletingTodo")}
          />
        ))}
      </ul>
    )}
  </Consumer>
)

// TodoList.propTypes = {
//   filteredTodos: PropTypes.arrayOf(
//     PropTypes.shape({
//       id: PropTypes.number.isRequired,
//       completed: PropTypes.bool.isRequired,
//       text: PropTypes.string.isRequired
//     }).isRequired
//   ).isRequired,
//   actions: PropTypes.object.isRequired
// }

export default TodoList
