using System;
using System.Diagnostics;
using System.IO;
using System.Text;

internal static class TrainingLauncher
{
#if TREINAR
    private const string Options = "--horas 8";
#elif VALIDAR
    private const string Options = "--horas 0 --validar";
#elif ATIVAR
    private const string Options = "--horas 0 --ativar";
#elif DESATIVAR
    private const string Options = "--desativar";
#else
#error Selecione uma ação para o launcher.
#endif

    private static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        bool help = args.Length == 1 && args[0] == "--ajuda";
        int exitCode = 1;
        try
        {
            if (args.Length > 0 && !help)
                throw new ArgumentException("Abra este executável sem parâmetros ou use --ajuda.");

            string project = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".."));
            string script = Path.Combine(project, "tools", "treinar-ia.mjs");
            if (!File.Exists(script))
                throw new FileNotFoundException("Mantenha a pasta Treinador-IA dentro da pasta do projeto Battalion.");

            Console.WriteLine("Battalion Nativo · IA");
            Console.WriteLine("Comando: node tools/treinar-ia.mjs " + Options);
            var settings = new ProcessStartInfo("node.exe", "\"" + script + "\" " + Options + (help ? " --ajuda" : ""))
            {
                WorkingDirectory = project,
                UseShellExecute = false
            };
            settings.EnvironmentVariables.Remove("NODE_OPTIONS");

            // The child receives Ctrl+C and finishes writing its checkpoint.
            ConsoleCancelEventHandler keepConsole = (sender, signal) => { signal.Cancel = true; };
            Console.CancelKeyPress += keepConsole;
            try
            {
                using (var trainer = Process.Start(settings))
                {
                    trainer.WaitForExit();
                    exitCode = trainer.ExitCode;
                }
            }
            finally { Console.CancelKeyPress -= keepConsole; }
        }
        catch (System.ComponentModel.Win32Exception)
        {
            Console.Error.WriteLine("O Node.js não foi encontrado. Confira se node.exe está no PATH.");
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.Message);
        }
        if (!help && !Console.IsInputRedirected)
        {
            Console.WriteLine("Pressione Enter para fechar.");
            Console.ReadLine();
        }
        return exitCode;
    }
}
