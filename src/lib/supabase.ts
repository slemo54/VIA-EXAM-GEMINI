import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

export const isSupabaseConfigured = !!supabase;

// Fallback to localStorage if Supabase is not configured
const getLocal = (key: string) => JSON.parse(localStorage.getItem(key) || '[]');
const setLocal = (key: string, data: any) => localStorage.setItem(key, JSON.stringify(data));

export async function getExams() {
  if (supabase) {
    const { data, error } = await supabase
      .from('exams')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;

    // For each exam, we need to fetch its answer key from the separate table
    // and reconstruct the JSON object for the UI
    const examsWithKeys = await Promise.all(data.map(async (exam) => {
      const { data: keys, error: keyError } = await supabase
        .from('answer_keys')
        .select('question_number, correct_option')
        .eq('exam_id', exam.id);
      
      if (keyError) throw keyError;

      const answerKey: Record<string, string> = {};
      keys.forEach(k => {
        answerKey[k.question_number.toString()] = k.correct_option;
      });

      return {
        ...exam,
        num_questions: exam.question_count,
        passing_score: exam.passing_threshold,
        answer_key: JSON.stringify(answerKey)
      };
    }));

    return examsWithKeys;
  } else {
    return getLocal('exams');
  }
}

export async function saveExam(exam: any) {
  if (supabase) {
    const { answer_key, num_questions, passing_score, ...examData } = exam;
    
    const { error: examError } = await supabase
      .from('exams')
      .upsert({
        ...examData,
        question_count: num_questions,
        passing_threshold: passing_score
      });
    
    if (examError) throw examError;

    // Save answer keys
    const parsedKey = JSON.parse(answer_key);
    const keyRows = Object.entries(parsedKey).map(([q, ans]) => ({
      exam_id: exam.id,
      question_number: parseInt(q),
      correct_option: ans
    }));

    // Delete old keys first to avoid duplicates on update
    await supabase.from('answer_keys').delete().eq('exam_id', exam.id);
    const { error: keyError } = await supabase.from('answer_keys').insert(keyRows);
    
    if (keyError) throw keyError;
  } else {
    const exams = getLocal('exams');
    const idx = exams.findIndex((e: any) => e.id === exam.id);
    if (idx > -1) exams[idx] = exam;
    else exams.push(exam);
    setLocal('exams', exams);
  }
}

export async function deleteExamData(examId: string) {
  if (supabase) {
    await supabase.from('results').delete().eq('exam_id', examId);
    await supabase.from('answer_keys').delete().eq('exam_id', examId);
    const { error } = await supabase.from('exams').delete().eq('id', examId);
    if (error) throw error;
  } else {
    const exams = getLocal('exams').filter((e: any) => e.id !== examId);
    setLocal('exams', exams);
    const results = getLocal('results').filter((r: any) => r.exam_id !== examId);
    setLocal('results', results);
  }
}

export async function getResults(examId: string) {
  if (supabase) {
    const { data, error } = await supabase
      .from('results')
      .select('*')
      .eq('exam_id', examId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    return data.map(r => ({
      ...r,
      answers: r.answers_json,
      is_passing: r.pass_fail
    }));
  } else {
    return getLocal('results').filter((r: any) => r.exam_id === examId);
  }
}

export async function saveResult(result: any) {
  if (supabase) {
    // Destructure to separate fields that might not exist in the DB schema
    // or need special mapping
    const { 
      answers, 
      is_passing, 
      confidence,
      max_score,
      total_correct,
      total_wrong,
      ...resultData 
    } = result;
    
    // Calculate stats for the schema
    let parsedAnswers = {};
    try {
      parsedAnswers = JSON.parse(answers);
    } catch (e) {
      console.error("Failed to parse answers JSON in saveResult:", e);
    }
    const totalAnswered = Object.keys(parsedAnswers).length;
    
    const { error } = await supabase
      .from('results')
      .upsert({
        ...resultData,
        answers_json: answers,
        pass_fail: is_passing,
        total_answered: totalAnswered,
        confidence: confidence,
        max_score: max_score,
        total_correct: total_correct || 0,
        total_wrong: total_wrong || 0
      });
    
    if (error) throw error;
  } else {
    const results = getLocal('results');
    results.push(result);
    setLocal('results', results);
  }
}

export async function deleteResultData(resultId: string) {
  if (supabase) {
    const { error } = await supabase.from('results').delete().eq('id', resultId);
    if (error) throw error;
  } else {
    const results = getLocal('results').filter((r: any) => r.id !== resultId);
    setLocal('results', results);
  }
}

export async function clearAll() {
  if (supabase) {
    // This is dangerous and usually not exposed like this in production
    // but following the user's request for "Reset/Clear All Data"
    await supabase.from('results').delete().neq('id', '0');
    await supabase.from('answer_keys').delete().neq('id', '0');
    await supabase.from('exams').delete().neq('id', '0');
  } else {
    localStorage.clear();
  }
}
