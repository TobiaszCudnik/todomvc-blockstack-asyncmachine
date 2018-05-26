import { machine } from "asyncmachine"
import * as filter_types from "./constants/TodoFilters"
import * as blockstack from "blockstack"
import Crypto from "simple-crypto-js"
import { encryptECIES, decryptECIES } from "blockstack/lib/encryption"

const state = {
  //  UI Actions

  AddingTodo: {},
  TodoAdded: { drop: ["AddingTodo"] },

  EditingTodo: {},
  TodoEdited: { drop: ["EditingTodo"] },

  DeletingTodo: {},
  TodoDeleted: { drop: ["DeletingTodo"] },

  CompletingTodo: {},
  TodoCompleted: { drop: ["CompletingTodo"] },

  CompletingAllTodos: {},
  AllTodosCompleted: { drop: ["CompletingAllTodos"] },

  ClearingCompleted: {},
  CompletedCleared: { drop: ["ClearingCompleted"] },

  SetVisibilityFilter: {},

  // SIGIN IN

  SignInClicked: {},
  SigningIn: { drop: ["SignedIn", "NotSignedIn"] },
  SignedIn: {
    drop: ["SigningIn", "NotSignedIn"],
    add: ["ReadingDB", "ReadingSubscribers"]
  },
  NotSignedIn: { drop: ["SignedIn", "SigningIn"] },
  SignOutClicked: {},

  // SYNCING DB

  InitialDBRead: {},

  ReadingDB: {
    require: ["KeyLoaded"],
    drop: ["WritingDB", "DBReadingDone"]
  },
  DBReadingDone: {
    drop: ["ReadingDB"],
    add: ["InitialDBRead"]
  },

  WritingDB: {
    require: ["KeyLoaded"],
    drop: ["ReadingDB", "DBWritingDone"]
  },
  DBWritingDone: { drop: ["WritingDB"] },

  // SYNCING SUBSCRIBERS

  ReadingSubscribers: {
    drop: ["WritingSubscribers", "SubscribersReadingDone"]
  },
  SubscribersReadingDone: { drop: ["ReadingSubscribers"] },

  WritingSubscribers: {
    drop: ["ReadingSubscribers", "SubscribersWritingDone"]
  },
  SubscribersWritingDone: { drop: ["WritingSubscribers"] },

  // ADDING A SUBSCRIBER

  AddingSubscriber: {},
  SubscriberAdded: { drop: ["AddingSubscriber"] },

  // KEY

  LoadingKey: {},
  KeyLoaded: { drop: ["LoadingKey"] },

  // METAS

  Ready: {
    auto: true,
    require: ["KeyLoaded", "SignedIn", "InitialDBRead"]
  }
}

export default class Manager {
  // config
  data_file = "todos3.json"
  subscribers_file = "subscribers.json"
  log_level = 2

  state = machine(state)
  data = new Data()
  encoders = {}
  data_key = null

  constructor() {
    this.state
      .setTarget(this)
      .id("todos")
      .logLevel(this.log_level)
    if (blockstack.isUserSignedIn()) {
      this.state.add("SignedIn")
    } else if (blockstack.isSignInPending()) {
      this.state.add("SigningIn")
    } else {
      this.state.add("NotSignedIn")
    }
  }

  // ----- TRANSITIONS

  // ADD

  AddingTodo_enter(text) {
    return Boolean(text)
  }

  async AddingTodo_state(text) {
    this.data.todos.unshift({ id: Math.random(), text, completed: false })
    this.state.add(["TodoAdded", "WritingDB"])
  }

  TodoAdded_state() {
    this.state.drop("TodoAdded")
  }

  // EDIT

  EditingTodo_enter(id) {
    if (!this.data.get(id)) {
      return false
    }
  }

  async EditingTodo_state(id, text) {
    this.data.get(id).text = text
    this.state.add(["TodoEdited", "WritingDB"])
  }

  TodoEdited_state() {
    this.state.drop("TodoEdited")
  }

  // DELETE

  DeletingTodo_enter(id) {
    if (!this.data.get(id)) {
      return false
    }
  }

  async DeletingTodo_state(id) {
    const index = this.data.todos.findIndex(t => t.id === id)
    // I regret nothing...
    this.data.todos.splice(index, 1)
    this.state.add(["TodoDeleted", "WritingDB"])
  }

  TodoDeleted_state() {
    this.state.drop("TodoDeleted")
  }

  // COMPLETE
  // handles both - completing and un-completing

  CompletingTodo_enter(id) {
    if (!this.data.get(id)) {
      return false
    }
  }

  async CompletingTodo_state(id, state) {
    this.data.get(id).completed = !!state
    this.state.add(["TodoCompleted", "WritingDB"])
  }

  TodoCompleted_state() {
    this.state.drop("TodoCompleted")
  }

  SetVisibilityFilter_state(filter) {
    this.data.visibilityFilter = filter
    this.state.drop("SetVisibilityFilter")
  }

  // CLEAR COMPLETED

  ClearingCompleted_state() {
    this.data.todos = this.data.todos.filter(t => !t.completed)
    this.state.add(["CompletedCleared", "WritingDB"])
  }

  // SIGN IN

  SignInClicked_state() {
    blockstack.redirectToSignIn()
  }

  async SigningIn_state() {
    await blockstack.handlePendingSignIn()
    this.data.user = blockstack.loadUserData()
    await this.setupKey()
    window.location = window.location.origin
  }

  SignedIn_state() {
    this.data.user = blockstack.loadUserData()
    this.state.add("LoadingKey")
  }

  SignOutClicked_state() {
    blockstack.signUserOut(window.location.origin)
  }

  // TODOS DB

  async WritingDB_state() {
    const username = this.data.user.username
    const encrypted_db = this.encoders[username].encrypt(
      JSON.stringify(this.data.todos)
    )
    await blockstack.putFile(this.data_file, encrypted_db)
    this.state.add("DBWritingDone")
  }

  async ReadingDB_state() {
    let encrypted_json = await blockstack.getFile(this.data_file)
    if (!encrypted_json) {
      this.state.add("DBReadingDone")
      this.state.add("WritingDB")
    } else {
      const username = this.data.user.username
      const decrypted_json = this.encoders[username].decrypt(encrypted_json)
      this.data.todos = JSON.parse(decrypted_json)
      this.state.add("DBReadingDone")
    }
  }

  // EXTERNAL TODOS

  async ReadingSubscribers_state() {
    const json = await blockstack.getFile(this.subscribers_file)
    if (json) {
      // initially there's no subscribers
      this.data.subscribers = JSON.parse(json)
      for (const subscriber of this.data.subscribers) {
        // TODO in parallel
        await this.readExternalDB(subscriber.username)
      }
      await this.saveFile()
    }
    this.state.add("SubscribersReadingDone")
  }

  AddingSubscriber_enter() {
    return this.not("WritingSubscribers")
  }

  async AddingSubscriber_state(username) {
    const key_json = await blockstack.getFile("key.json", {
      username: username
    })
    const public_key = JSON.parse(key_json)
    this.data.subscribers.push({
      username: username,
      publicKey: public_key
    })
    await this.saveDataKey(public_key, username, this.data_key)
    this.state.add("WritingSubscribers")
    await this.state.when("SubscribersWritingDone")
    await this.readExternalDB(username)
    this.state.add("SubscriberAdded")
  }

  async WritingSubscribers_state() {
    const json = JSON.stringify(this.data.subscribers)
    await blockstack.putFile(this.subscribers_file, json)
    this.state.add("SubscribersWritingDone")
  }

  async LoadingKey_state() {
    const username = this.data.user.username
    const encrypted_key = JSON.parse(
      await blockstack.getFile(`keys/${username}`)
    )
    this.data_key = decryptECIES(this.data.user.appPrivateKey, encrypted_key)
    this.encoders[username] = new Crypto(this.data_key)
    this.state.add("KeyLoaded")
  }

  Exception_state(err, target_states) {
    debugger
    if (target_states.includes("LoadingKey")) {
      // TODO make this handler async once the bug in asyncmachine get fixed
      this.setupKey().then(() => {
        this.state.drop(["Exception", "LoadingKey"])
        this.state.add("LoadingKey")
      })
    } else if (target_states.includes("SigningIn")) {
      this.state.add("NotSignedIn")
      this.state.drop("Exception")
    }
  }

  // ----- METHODS

  async setupKey() {
    const data_key = Crypto.generateRandom()
    const publicKey = blockstack.getPublicKeyFromPrivate(
      this.data.user.appPrivateKey
    )
    // public key others can use to encrypt their key giving access to the data
    await blockstack.putFile("key.json", JSON.stringify(publicKey))
    await this.saveDataKey(publicKey, this.data.user.username, data_key)
    this.data_key = data_key
  }

  mergeDB(todos) {
    // TODO merge using automerge
    for (const todo of todos) {
      if (this.data.get(todo.id)) continue
      this.data.todos.push(todo)
    }
  }

  async saveFile() {
    this.state.add("WritingDB")
    await this.state.when("DBWritingDone")
  }

  // TODO error handling
  async readExternalDB(username) {
    const tasks = [
      await blockstack.getFile(this.data_file, {
        username
      })
    ]
    if (!this.encoders[username]) {
      tasks.push(
        await blockstack.getFile(`keys/${this.data.user.username}`, {
          username
        })
      )
    }
    const [encrypted_json, encrypted_data_key] = Promise.all(tasks)

    if (!this.encoders[username]) {
      // decrypt the data key with our own private key
      const data_key = decryptECIES(
        this.data.user.appPrivateKey,
        encrypted_data_key
      )
      this.encoders[username] = new Crypto(data_key)
    }
    // decrypt json with the decrypted data key
    json = this.encoders[username].decrypt(encrypted_json)
    this.mergeDB(JSON.parse(json))
  }

  async saveDataKey(encryption_key, username, data_key) {
    const encrypted_data_key = encryptECIES(encryption_key, data_key)
    await blockstack.putFile(
      `keys/${username}`,
      JSON.stringify(encrypted_data_key)
    )
  }
}

export class Data {
  todos = []
  visibilityFilter = filter_types.SHOW_ALL
  user = null
  subscribers = []

  get activeCount() {
    return this.filtered_todos.length - this.completedCount
  }

  get completedCount() {
    return this.todos.filter(t => t.completed).reduce((ret, t) => ++ret, 0)
  }

  get filtered_todos() {
    const t = filter_types
    switch (this.visibilityFilter) {
      case t.SHOW_ACTIVE:
        return this.todos.filter(t => !t.completed)
      case t.SHOW_COMPLETED:
        return this.todos.filter(t => t.completed)
      default:
        return this.todos
    }
  }

  get(id) {
    return this.todos.find(t => t.id === id)
  }
}
