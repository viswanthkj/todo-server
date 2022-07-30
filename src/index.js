const { ApolloServer, gql } = require('apollo-server');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const dotenv = require('dotenv');
dotenv.config()


const {DB_URI, DB_NAME, JWT_SECRET} = process.env;

const getToken = (user) => jwt.sign({id: user._id}, JWT_SECRET, {expiresIn: '30 days'})
console.log('viswa-getToken',getToken)

const getUserFromToken = async(token,db) => {
  if(!token) return null
  const tokenData = jwt.verify(token, JWT_SECRET)
  if(!tokenData.id) {
    return null;
  }
  return await db.collection('Users').findOne({ _id: ObjectId(tokenData.id)});
}

// A schema is a collection of type definitions (hence "typeDefs")
// that together define the "shape" of queries that are executed against
// your data.
const typeDefs = gql`
   type Query {
     myTaskLists: [TaskList!]!
     getTaskList(id: ID!): TaskList
   }

   type Mutation {
     signUp(input: SignUpInput!) : AuthUser!
     signIn(input: SignInInput!) : AuthUser!
     createTaskList(title: String!) : TaskList!
     updateTaskList(id: ID!, title: String!): TaskList!
     deleteTaskList(id: ID!): Boolean!
     addUserToTaskList(taskListId: ID!, userId: ID!): TaskList
     createToDo(content: String!, taskListId: ID!): ToDo!
     updateToDo(id: ID!, content: String, isCompleted: Boolean): ToDo!
     deleteToDo(id: ID!): Boolean!
   }

   input SignUpInput {
    email: String!,
    name: String!, 
    password: String!, 
    avatar: String
   }

   input SignInInput {
    email: String!,
    password: String!, 
   }

   type AuthUser {
     user: User!
     token: String!
   }

   type User {
     id: ID!
     name: String!
     email: String!
     avatar: String
   }

   type TaskList {
     id: ID!
     createdAt: String!
     title: String!
     progress: Float!
     users: [User!]!
     todos: [ToDo!]!
   }

   type ToDo {
     id: ID!
     content: String!
     isCompleted: Boolean!
     taskList: TaskList!
   }
`;

// Resolvers define the technique for fetching the types defined in the
// schema. This resolver retrieves books from the "books" array above.
const resolvers = {
   Query: {
    myTaskLists: async (_, __, { db, user }) => {
      if (!user) { throw new Error('Authentication Error. Please sign in'); }
      return await db.collection('TaskList').find({ userIds: user._id }).toArray();
    },
    
    getTaskList: async(_, { id }, { db, user }) => {
      if (!user) { throw new Error('Authentication Error. Please sign in'); }
      return await db.collection('TaskList').findOne({ _id: ObjectId(id) });
    }
   },
   Mutation: {
     signUp: async(_, { input}, {db}) => {
        console.log(input)
        const hashedPassword = bcrypt.hashSync(input.password)
        console.log(hashedPassword)
        const newUser = {
          ...input,
          password: hashedPassword
        }
        // save to db
        const result = await db.collection('Users').insertOne(newUser);
        console.log(result)
        const someId = result.insertedId;
        const user = await db
        .collection('Users')
        .findOne({ _id: someId });
        return {
          user,
          token: getToken(user)
        }
     },
     signIn: async(_, { input}, {db}) => {
      console.log(input)
      const user = await db.collection('Users').findOne({ email: input.email });
      console.log(user)
      if(!user) {
        throw new Error('Invalid credentials!')
      }

      const ispasswordCorrect = bcrypt.compareSync(input.password, user.password)
      if(!ispasswordCorrect) {
        throw new Error('Invalid credentials!')
      }
      return {
        user,
        token: getToken(user)
      }
     },

     // create
     createTaskList: async(_, { title }, { db, user }) => {
      if (!user) { throw new Error('Authentication Error. Please sign in'); }
      const newTaskList = {
        title,
        createdAt: new Date().toISOString(),
        userIds: [user._id]
      }
      console.log('`````newTaskList`````````', newTaskList)
      const result = await db.collection('TaskList').insertOne(newTaskList);
      console.log('````result``', result)
      const someId = result.insertedId;
      console.log('````someId``', someId)
      const insertedList = await db.collection('TaskList').findOne({ _id: someId });
      console.log('`````insertedList`````````', insertedList)
      return insertedList
    },

    // update
    updateTaskList: async(_, { id, title }, { db, user }) => {
      if (!user) { throw new Error('Authentication Error. Please sign in'); }

      await db.collection('TaskList')
                            .updateOne({
                              _id: ObjectId(id)
                            }, {
                              $set: {
                                title
                              }
                            })
      return await db.collection('TaskList').findOne({ _id: ObjectId(id) });
    },

    // delete
    deleteTaskList: async(_, { id }, { db, user }) => {
      if (!user) { throw new Error('Authentication Error. Please sign in'); }
      
      // TODO only collaborators of this task list should be able to delete
      const result = await db.collection('TaskList').deleteOne({ _id: ObjectId(id) });
      console.log('``````result``````', result)
      if(result.deletedCount === 0) return false;
      return true;
    },

    addUserToTaskList: async(_, { taskListId, userId }, { db, user }) => {
      if (!user) { throw new Error('Authentication Error. Please sign in'); }

      const taskList = await db.collection('TaskList').findOne({ _id: ObjectId(taskListId) });
      if (!taskList) {
        return null;
      }
      if (taskList.userIds.find((dbId) => dbId.toString() === userId.toString())) {
        return taskList;
      }
      await db.collection('TaskList')
              .updateOne({
                _id: ObjectId(taskListId)
              }, {
                $push: {
                  userIds: ObjectId(userId),
                }
              })
      taskList.userIds.push(ObjectId(userId))
      return taskList;
    },

     // ToDo Items
     createToDo: async(_, { content, taskListId }, { db, user }) => {
      if (!user) { throw new Error('Authentication Error. Please sign in'); }
      const newToDo = {
        content, 
        taskListId: ObjectId(taskListId),
        isCompleted: false,
      }
      const result = await db.collection('ToDo').insertOne(newToDo);
      console.log('````result``', result)
      const someId = result.insertedId;
      console.log('````someId``', someId)
      const insertedToDO = await db.collection('ToDo').findOne({ _id: someId });
      console.log('`````insertedToDO`````````', insertedToDO)
      return insertedToDO
    },

    updateToDo: async(_, data, { db, user }) => {
      if (!user) { throw new Error('Authentication Error. Please sign in'); }

      const result = await db.collection('ToDo')
                            .updateOne({
                              _id: ObjectId(data.id)
                            }, {
                              $set: data
                            })
      
      return await db.collection('ToDo').findOne({ _id: ObjectId(data.id) });
    },

    
    deleteToDo: async(_, { id }, { db, user }) => {
      if (!user) { throw new Error('Authentication Error. Please sign in'); }
      
      // TODO only collaborators of this task list should be able to delete
      await db.collection('ToDo').deleteOne({ _id: ObjectId(id) });

      return true;
    },
   },

  User: {
    id: ({_id,id}) => _id || id
  },

  TaskList: {
    id: ({_id,id}) => _id || id,
    progress: async ({ _id }, _, { db })  => {
      const todos = await db.collection('ToDo').find({ taskListId: ObjectId(_id)}).toArray()
      const completed = todos.filter(todo => todo.isCompleted);

      if (todos.length === 0) {
        return 0;
      }

      return 100 * completed.length / todos.length
    },
    users: async ({ userIds }, _, { db }) => Promise.all(
      userIds.map((userId) => (
        db.collection('Users').findOne({ _id: userId}))
      )
    ),
    todos: async ({ _id }, _, { db }) => (
      await db.collection('ToDo').find({ taskListId: ObjectId(_id)}).toArray()
    ), 
  },

  ToDo: {
    id: ({ _id, id }) => _id || id,
    taskList: async ({ taskListId }, _, { db }) => (
      await db.collection('TaskList').findOne({ _id: ObjectId(taskListId) })
    )
  },
};

const start = async() => {
  const client = new MongoClient(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
  await client.connect()
  const db=client.db(DB_NAME)

  const context = {
    db,
  }

  // The ApolloServer constructor requires two parameters: your schema
// definition and your set of resolvers.
const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: async({req}) => {
    const user = await getUserFromToken(req.headers.authorization, db);
    return {
      db,
      user
    }
  },
  csrfPrevention: true,
});

// The `listen` method launches a web server.
server.listen().then(({ url }) => {
  console.log(`🚀  Server ready at ${url}`);
});
}

start()



