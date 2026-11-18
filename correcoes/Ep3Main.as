package com.gamedozer.battalion
{
   import com.gamedozer.battalion.ui.MenuManager;
   import com.gamedozer.battalion.ui.CampaignMenuData;
   import com.gamedozer.battalion.game.GameManager;
   import com.gamedozer.battalion.game.GameCamera;
   import com.gamedozer.battalion.data.CampaignManager;
   import com.gamedozer.battalion.data.MapSettings;
   import com.gamedozer.battalion.ui.GameMenu;
   import com.gamedozer.battalion.ui.GameMenuData;
   import flash.display.Bitmap;
   import flash.display.Sprite;
   import flash.external.ExternalInterface;
   
   public class Ep3Main extends BattalionMain
   {
      
      public function Ep3Main()
      {
         super(new Ep3Context());
      }
      
      private function finishSplash() : void
      {
         if(m_loadingStatus != null) m_loadingStatus.visible = false;
         screen = new Sprite();
         this.addChild(screen);
         s_modeManager = new MenuManager(screen);
         var lan:Boolean = this.root.loaderInfo.parameters.local_match == "1";
         GameManager.localScenario = this.root.loaderInfo.parameters.local_scenario == "1";
         GameManager.privateTurns = this.root.loaderInfo.parameters.local_hotseat == "1";
         updateSoundSystem();
         if(ExternalInterface.available)
         {
            ExternalInterface.addCallback("localZoom",GameCamera.localZoom);
            ExternalInterface.addCallback("localCameraPan",GameCamera.localCameraPan);
            if(lan)
            {
               ExternalInterface.addCallback("localTurn",localTurn);
            }
         }
         if(lan || this.root.loaderInfo.parameters.local_hotseat == "1")
         {
            var campaign:CampaignManager = CampaignManager.getInstance("Campaign");
            var settingsXML:XML = campaign.getMapSettings(0);
            settingsXML.@difficulty = 1;
            var settings:MapSettings = MapSettings.getFromXML(settingsXML);
            var data:GameMenuData = new GameMenuData(campaign.getMapURL(0),campaign.getMapName(0),settings);
            s_modeManager.createMode(new GameMenu(),data);
         }
         else if(this.root.loaderInfo.parameters.local_scenario == "1")
         {
            BattalionMain.MODE_MANAGER.pushMode(MenuManager.campaignMenu,new CampaignMenuData("Campaign"));
         }
         else
         {
            BattalionMain.MODE_MANAGER.pushMode(MenuManager.mainMenu,null);
         }
      }

      private function localTurn() : int
      {
         var game:GameManager = GameManager.getInstance();
         return game == null ? -1 : game.getCurrentController();
      }
      
      override protected function start() : void
      {
         var splash:ExplodingSplash = null;
         if(!ALLOW_DEBUG && this.root.loaderInfo.parameters.local_scenario != "1")
         {
            splash = new ExplodingSplash(new Bitmap(new splash_bunny_batt(0,0)),true,finishSplash);
            this.addChild(splash);
         }
         else
         {
            finishSplash();
         }
      }
   }
}


