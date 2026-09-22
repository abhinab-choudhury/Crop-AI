import mongoose from 'mongoose';

const chatHistorySchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    chatContent: [
      {
        role: { type: String, enum: ['user', 'bot'], required: true },
        message: { type: String, required: true },
      },
    ],
  },
  {
    timestamps: true,
  },
);

const ChatHistoryModel = mongoose.model('ChatHistory', chatHistorySchema);
export default ChatHistoryModel;
