{
  mattpocock = {
    source = builtins.fetchGit {
      url = "https://github.com/junr03/skills.git";
      rev = "49dd158d1076134a641b33efb035946536778336";
    };
    directories = [ "skills" ];
  };
}
